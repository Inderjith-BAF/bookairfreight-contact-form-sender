import {NextResponse} from "next/server";
import {requireOutboundUser} from "@/lib/outbound-auth";
import {getProviderAccess} from "@/lib/mail-merge-provider";
export const runtime="nodejs";
const header=(m:any,n:string)=>String((m.payload?.headers||[]).find((h:any)=>String(h.name).toLowerCase()===n.toLowerCase())?.value||"");
export async function POST(request:Request){
 const auth=await requireOutboundUser(request);if("error" in auth)return auth.error;const {admin,profile}=auth;
 const {data:accounts}=await admin.from("outbound_email_accounts").select("*").eq("active",true).eq("connection_status","Connected");let matched=0;
 for(const account of accounts||[]){
  if(profile.role==="member"&&account.employee_id!==profile.id)continue;
  try{
   const access=await getProviderAccess(account,admin);let messages:any[]=[];
   if(account.provider==="google"){
    const r=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=100&q=newer_than:30d",{headers:{Authorization:"Bearer "+access}});
    const d=await r.json();if(!r.ok)throw new Error(d.error?.message||"Gmail inbox sync failed.");
    for(const m of d.messages||[]){const full=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/"+m.id+"?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=In-Reply-To&metadataHeaders=References",{headers:{Authorization:"Bearer "+access}});const x=await full.json();if(full.ok)messages.push({id:x.id,threadId:x.threadId,from:header(x,"From"),subject:header(x,"Subject")});}
    const {data:sent}=await admin.from("mail_merge_campaign_recipients").select("id,campaign_id,lead_id,sender_account_id,provider_thread_id,provider_message_id,status").eq("sender_account_id",account.id).not("provider_thread_id","is",null).in("status",["Sent","Replied"]).limit(1000);
    const map=new Map((sent||[]).map((r:any)=>[r.provider_thread_id,r]));
    for(const m of messages){const row=map.get(m.threadId);if(!row||row.status==="Replied")continue;if(m.from.toLowerCase().includes(account.email.toLowerCase()))continue;const now=new Date().toISOString();await admin.from("mail_merge_campaign_recipients").update({status:"Replied",updated_at:now}).eq("id",row.id);await admin.from("master_leads").update({current_status:"Needs Review",last_replied_at:now,updated_at:now}).eq("id",row.lead_id);await admin.from("mail_merge_events").insert({campaign_recipient_id:row.id,campaign_id:row.campaign_id,lead_id:row.lead_id,sender_account_id:account.id,event_type:"reply",details:{source:"gmail_sync",from:m.from,subject:m.subject,message_id:m.id}});matched++;}
   }else{
    const r=await fetch("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=100&$select=id,subject,from,receivedDateTime,internetMessageId&$orderby=receivedDateTime%20desc",{headers:{Authorization:"Bearer "+access,Prefer:'outlook.body-content-type="text"'}});const d=await r.json();if(!r.ok)throw new Error(d.error?.message||"Microsoft inbox sync failed.");
    messages=d.value||[];const {data:sent}=await admin.from("mail_merge_campaign_recipients").select("id,campaign_id,lead_id,sender_account_id,subject,status,created_at").eq("sender_account_id",account.id).in("status",["Sent","Replied"]).order("created_at",{ascending:false}).limit(1000);
    const leadIds=[...new Set((sent||[]).map((r:any)=>r.lead_id))];const {data:leads}=leadIds.length?await admin.from("master_leads").select("id,email").in("id",leadIds):{data:[]};const emailMap=new Map((leads||[]).map((l:any)=>[l.email.toLowerCase(),l.id]));
    for(const m of messages){const from=String(m.from?.emailAddress?.address||"").toLowerCase(),leadId=emailMap.get(from);if(!leadId)continue;const row=(sent||[]).find((r:any)=>r.lead_id===leadId&&String(r.subject||"").replace(/^re:\s*/i,"").toLowerCase()===String(m.subject||"").replace(/^re:\s*/i,"").toLowerCase());if(!row||row.status==="Replied")continue;const now=new Date().toISOString();await admin.from("mail_merge_campaign_recipients").update({status:"Replied",updated_at:now}).eq("id",row.id);await admin.from("master_leads").update({current_status:"Needs Review",last_replied_at:now,updated_at:now}).eq("id",row.lead_id);await admin.from("mail_merge_events").insert({campaign_recipient_id:row.id,campaign_id:row.campaign_id,lead_id:row.lead_id,sender_account_id:account.id,event_type:"reply",details:{source:"microsoft_sync",from,subject:m.subject,message_id:m.id}});matched++;}
   }
  }catch(e){await admin.from("outbound_email_accounts").update({connection_status:"Error",connection_error:e instanceof Error?e.message:"Mailbox sync failed"}).eq("id",account.id);}
 }
 return NextResponse.json({matched,message:matched?"Synced "+matched+" new replies.":"No new replies found."});
}
