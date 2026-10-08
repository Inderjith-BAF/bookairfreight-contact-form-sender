import {decryptSecret,encryptSecret} from "@/lib/mail-merge-oauth";
type Provider="google"|"microsoft";
type Account={id:string;email:string;provider:Provider;refresh_token_encrypted:string;access_token_encrypted?:string|null;access_token_expires_at?:string|null;provider_account_id?:string|null;};
async function googleAccess(account:Account,admin:any){
 const refresh=decryptSecret(account.refresh_token_encrypted);
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID||"",client_secret:process.env.GOOGLE_CLIENT_SECRET||"",refresh_token:refresh,grant_type:"refresh_token"})});
 const d=await r.json();if(!r.ok||!d.access_token)throw new Error(d.error_description||"Google authorization expired. Reconnect this account.");
 await admin.from("outbound_email_accounts").update({access_token_encrypted:encryptSecret(d.access_token),access_token_expires_at:new Date(Date.now()+Number(d.expires_in||3600)*1000).toISOString(),connection_status:"Connected",connection_error:null,last_verified_at:new Date().toISOString()}).eq("id",account.id);
 return d.access_token;
}
async function microsoftAccess(account:Account,admin:any){
 const refresh=decryptSecret(account.refresh_token_encrypted);
 const tenant=process.env.MICROSOFT_TENANT_ID||"common";
 const r=await fetch("https://login.microsoftonline.com/"+encodeURIComponent(tenant)+"/oauth2/v2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.MICROSOFT_CLIENT_ID||"",client_secret:process.env.MICROSOFT_CLIENT_SECRET||"",refresh_token:refresh,grant_type:"refresh_token",scope:"offline_access Mail.Send Mail.Read"})});
 const d=await r.json();if(!r.ok||!d.access_token)throw new Error(d.error_description||"Microsoft authorization expired. Reconnect this account.");
 await admin.from("outbound_email_accounts").update({access_token_encrypted:encryptSecret(d.access_token),access_token_expires_at:new Date(Date.now()+Number(d.expires_in||3600)*1000).toISOString(),connection_status:"Connected",connection_error:null,last_verified_at:new Date().toISOString()}).eq("id",account.id);
 return d.access_token;
}
export async function getProviderAccess(account:Account,admin:any){return account.provider==="google"?googleAccess(account,admin):microsoftAccess(account,admin);}
const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
export function renderTrackedHtml(body:string,trackingBase:string,token:string){
 let html=esc(body).replace(/\r?
/g,"<br>");
 html=html.replace(/https?:\/\/[^\s<]+/gi,(url)=>'<a href="'+trackingBase+'/click/'+token+'?url='+encodeURIComponent(url)+'">'+url+'</a>');
 return html+'<img src="'+trackingBase+'/open/'+token+'" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />';
}
function b64url(v:string){return Buffer.from(v).toString("base64url");}
function mimeMessage(from:string,to:string,subject:string,html:string,extra:Record<string,string>={}){
 const lines=["From: "+from,"To: "+to,"Subject: "+subject,"MIME-Version: 1.0","Content-Type: text/html; charset=UTF-8",...Object.entries(extra).map(([k,v])=>k+": "+v),"",html];
 return b64url(lines.join("\r
"));
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
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error?.message||"Gmail rejected the message.");
  return {messageId:String(d.id||""),threadId:String(d.threadId||"")};
 }
 if(input.replyToMessageId){const r=await fetch("https://graph.microsoft.com/v1.0/me/messages/"+encodeURIComponent(input.replyToMessageId)+"/reply",{method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},body:JSON.stringify({message:{body:{contentType:"HTML",content:html}}})});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error?.message||"Microsoft could not send the reply.");}return {messageId:input.replyToMessageId,threadId:""};}
 const r=await fetch("https://graph.microsoft.com/v1.0/me/messages",{method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},body:JSON.stringify({subject:input.subject,body:{contentType:"HTML",content:html},toRecipients:[{emailAddress:{address:input.to}}]})});
 const draft=await r.json().catch(()=>({}));if(!r.ok)throw new Error(draft.error?.message||"Microsoft Graph rejected the message.");
 const send=await fetch("https://graph.microsoft.com/v1.0/me/messages/"+encodeURIComponent(draft.id)+"/send",{method:"POST",headers:{Authorization:"Bearer "+access}});
 if(!send.ok){const d=await send.json().catch(()=>({}));throw new Error(d.error?.message||"Microsoft Graph could not send the message.");}
 return {messageId:String(draft.id||""),threadId:""};
}
