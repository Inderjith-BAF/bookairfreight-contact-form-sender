import {decryptSecret,encryptSecret} from "@/lib/mail-merge-oauth";
type Provider="google"|"microsoft";
type Account={id:string;email:string;provider:Provider;refresh_token_encrypted:string;access_token_encrypted?:string|null;access_token_expires_at?:string|null;provider_account_id?:string|null;employee_id?:string|null;};

async function markConnectionFailure(account:Account,admin:any,message:string){
 await admin.from("outbound_email_accounts").update({connection_status:"Disconnected",connection_error:message,last_verified_at:new Date().toISOString()}).eq("id",account.id);
 if(account.employee_id){const {data:existing}=await admin.from("mail_merge_notifications").select("id").eq("recipient_profile_id",account.employee_id).eq("account_id",account.id).eq("notification_type","account_disconnected").is("read_at",null).maybeSingle();if(!existing)await admin.from("mail_merge_notifications").insert({recipient_profile_id:account.employee_id,notification_type:"account_disconnected",account_id:account.id,title:"Email account disconnected",message:account.email+" is no longer connected and has been removed from the active sending pool. Reconnect the mailbox before its queued batches can resume."});}
}

async function googleAccess(account:Account,admin:any){
 const refresh=decryptSecret(account.refresh_token_encrypted);
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID||"",client_secret:process.env.GOOGLE_CLIENT_SECRET||"",refresh_token:refresh,grant_type:"refresh_token"})});
 const d=await r.json();
 if(!r.ok||!d.access_token){const message=d.error_description||"Google authorization expired. Reconnect this account.";if(["invalid_grant","unauthorized_client"].includes(String(d.error||"")))await markConnectionFailure(account,admin,message);throw new Error(message);}
 await admin.from("outbound_email_accounts").update({access_token_encrypted:encryptSecret(d.access_token),access_token_expires_at:new Date(Date.now()+Number(d.expires_in||3600)*1000).toISOString(),connection_status:"Connected",connection_error:null,last_verified_at:new Date().toISOString()}).eq("id",account.id);
 return d.access_token;
}
async function microsoftAccess(account:Account,admin:any){
 const refresh=decryptSecret(account.refresh_token_encrypted);
 const tenant=process.env.MICROSOFT_TENANT_ID||"common";
 const r=await fetch("https://login.microsoftonline.com/"+encodeURIComponent(tenant)+"/oauth2/v2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.MICROSOFT_CLIENT_ID||"",client_secret:process.env.MICROSOFT_CLIENT_SECRET||"",refresh_token:refresh,grant_type:"refresh_token",scope:"offline_access Mail.Send Mail.Read"})});
 const d=await r.json();
 if(!r.ok||!d.access_token){const message=d.error_description||"Microsoft authorization expired. Reconnect this account.";if(["invalid_grant","invalid_client","interaction_required"].includes(String(d.error||"")))await markConnectionFailure(account,admin,message);throw new Error(message);}
 await admin.from("outbound_email_accounts").update({access_token_encrypted:encryptSecret(d.access_token),access_token_expires_at:new Date(Date.now()+Number(d.expires_in||3600)*1000).toISOString(),connection_status:"Connected",connection_error:null,last_verified_at:new Date().toISOString()}).eq("id",account.id);
 return d.access_token;
}
export async function getProviderAccess(account:Account,admin:any){
 try{return account.provider==="google"?await googleAccess(account,admin):await microsoftAccess(account,admin);}
 catch(error){const message=error instanceof Error?error.message:"Mailbox authorization failed.";if(/authorization expired|invalid_grant|interaction_required|reconnect this account/i.test(message))await markConnectionFailure(account,admin,message);throw error;}
}
const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const attr=(s:string)=>esc(s).replace(/'/g,"&#39;");
function sanitizeEmailHtml(input:string){
 const hasMarkup=/<\/?[a-z][^>]*>/i.test(input);
 if(!hasMarkup)return esc(input).replace(/\r?\n/g,"<br>");
 let html=input.replace(/<!--[\s\S]*?-->/g,"");
 html=html.replace(/<\s*(script|style|iframe|object|embed|svg|math|form|input|button|meta|link|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,"");
 html=html.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,"");
 html=html.replace(/<([^>]+)>/g,(full:string,raw:string)=>{
  const close=/^\s*\/\s*([a-z0-9]+)/i.exec(raw);
  if(close){const n=close[1].toLowerCase();return ["b","strong","i","em","u","s","p","div","br","ul","ol","li","a","span","font"].includes(n)?"</"+n+">":""}
  const m=/^\s*([a-z0-9]+)/i.exec(raw);if(!m)return "";
  const n=m[1].toLowerCase();if(!["b","strong","i","em","u","s","p","div","br","ul","ol","li","a","span","font"].includes(n))return "";
  if(n==="a"){const href=/href\s*=\s*["']([^"']+)["']/i.exec(raw)?.[1]||"";return (/^https?:\/\//i.test(href)||/^mailto:/i.test(href))?'<a href="'+attr(href)+'">':"<a>";}
  if(n==="font"){const color=/color\s*=\s*["'](#[0-9a-f]{3,8})["']/i.exec(raw)?.[1]||"";return color?'<font color="'+attr(color)+'">':"<font>";}
  return "<"+n+">";
 });
 return html.replace(/\r?\n/g,"<br>");
}
export function renderTrackedHtml(body:string,trackingBase:string,token:string){
 let html=sanitizeEmailHtml(body);
 html=html.replace(/<a href="(https?:\/\/[^"]+)">([\s\S]*?)<\/a>/gi,(match,url,text)=>'<a href="'+trackingBase+'/click/'+token+'?url='+encodeURIComponent(url)+'">'+text+"</a>");
 html=html.replace(/(?<![="])https?:\/\/[^\s<]+/gi,(url)=>'<a href="'+trackingBase+'/click/'+token+'?url='+encodeURIComponent(url)+'">'+url+"</a>");
 return html+'<img src="'+trackingBase+'/open/'+token+'" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />';
}

function b64url(v:string){return Buffer.from(v).toString("base64url");}
function mimeMessage(from:string,to:string,subject:string,html:string,extra:Record<string,string>={}){
 const lines=["From: "+from,"To: "+to,"Subject: "+subject,"MIME-Version: 1.0","Content-Type: text/html; charset=UTF-8",...Object.entries(extra).map(([k,v])=>k+": "+v),"",html];
 return b64url(lines.join("\r\n"));
}
export async function sendThroughProvider(account:Account,input:{to:string;subject:string;body:string;trackingBase:string;trackingToken:string;replyToMessageId?:string;replyToThreadId?:string},admin:any){
 const access=await getProviderAccess(account,admin);
 const html=renderTrackedHtml(input.body,input.trackingBase,input.trackingToken);
 if(account.provider==="google"){
  const headers:Record<string,string>={};
  if(input.replyToMessageId){headers["In-Reply-To"]=input.replyToMessageId;headers["References"]=input.replyToMessageId;}
  const message:any={raw:mimeMessage(account.email,input.to,input.subject,html,headers)};
  if(input.replyToThreadId)message.threadId=input.replyToThreadId;
  const r=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},body:JSON.stringify(message)});
  const d=await r.json().catch(()=>({}));if(!r.ok){const message=d.error?.message||"Gmail rejected the message.";if(r.status===401||r.status===403)await markConnectionFailure(account,admin,message);throw new Error(message);}
  return {messageId:String(d.id||""),threadId:String(d.threadId||"")};
 }
 if(input.replyToMessageId){const r=await fetch("https://graph.microsoft.com/v1.0/me/messages/"+encodeURIComponent(input.replyToMessageId)+"/reply",{method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},body:JSON.stringify({message:{body:{contentType:"HTML",content:html}}})});if(!r.ok){const d=await r.json().catch(()=>({}));const message=d.error?.message||"Microsoft could not send the reply.";if(r.status===401||r.status===403)await markConnectionFailure(account,admin,message);throw new Error(message);}return {messageId:input.replyToMessageId,threadId:""};}
 const r=await fetch("https://graph.microsoft.com/v1.0/me/messages",{method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},body:JSON.stringify({subject:input.subject,body:{contentType:"HTML",content:html},toRecipients:[{emailAddress:{address:input.to}}]})});
 const draft=await r.json().catch(()=>({}));if(!r.ok){const message=draft.error?.message||"Microsoft Graph rejected the message.";if(r.status===401||r.status===403)await markConnectionFailure(account,admin,message);throw new Error(message);}
 const send=await fetch("https://graph.microsoft.com/v1.0/me/messages/"+encodeURIComponent(draft.id)+"/send",{method:"POST",headers:{Authorization:"Bearer "+access}});
 if(!send.ok){const d=await send.json().catch(()=>({}));const message=d.error?.message||"Microsoft Graph could not send the message.";if(send.status===401||send.status===403)await markConnectionFailure(account,admin,message);throw new Error(message);}
 return {messageId:String(draft.id||""),threadId:""};
}
