import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
import {sendThroughProvider} from "@/lib/mail-merge-provider";
import {signTrackingToken} from "@/lib/mail-merge-tracking";
export const runtime="nodejs"; export const maxDuration=60;
export async function POST(request:Request){
 const auth=await requireOutboundUser(request); if("error" in auth)return auth.error; const {admin,profile}=auth; const b=await request.json().catch(()=>null); const campaignId=String(b?.campaignId||"");
 if(!campaignId)return NextResponse.json({error:"Campaign ID is required."},{status:400});
 const providerUrl=process.env.MAIL_MERGE_PROVIDER_URL,providerKey=process.env.MAIL_MERGE_PROVIDER_KEY;
 if(!providerUrl||!providerKey)return NextResponse.json({error:"Sending is not enabled yet. Configure MAIL_MERGE_PROVIDER_URL and MAIL_MERGE_PROVIDER_KEY for the approved email provider."},{status:503});
 const {data:rows,error}=await admin.from("mail_merge_campaign_recipients").select("*,master_leads(*),outbound_email_accounts(*)").eq("campaign_id",campaignId).eq("status","Queued").limit(100); if(error)return NextResponse.json({error:error.message},{status:500});
 if(!rows?.length)return NextResponse.json({error:"No queued recipients are ready to send."},{status:409});
 let sent=0,failed=0;
 for(const row of rows){
  const lead=row.master_leads; const account=row.outbound_email_accounts;
  if(!account||account.connection_status!=="Connected"||!account.refresh_token_encrypted){await admin.from("mail_merge_campaign_recipients").update({status:"Failed",error_message:"Sending account is not connected. Reconnect the mailbox before dispatch.",updated_at:new Date().toISOString()}).eq("id",row.id);failed++;continue;}\n  if(!lead||lead.suppression_reason||["Bounced","Unsubscribed","Suppressed","Positive","Neutral","Negative"].includes(lead.current_status)){await admin.from("mail_merge_campaign_recipients").update({status:"Suppressed",error_message:"Suppressed before dispatch.",updated_at:new Date().toISOString()}).eq("id",row.id);continue;}
  await admin.from("mail_merge_campaign_recipients").update({status:"Sending",updated_at:new Date().toISOString()}).eq("id",row.id);
  try{
   const response=await fetch(providerUrl,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+providerKey},body:JSON.stringify({to:lead.email,from_account_id:row.sender_account_id,subject:row.subject,body:row.body,lead_id:lead.id,campaign_id:campaignId})});
   const payload=await response.json().catch(()=>({})); if(!response.ok)throw new Error(payload.error||"Email provider rejected the message.");
   const now=new Date().toISOString(); const providerId=String(payload.message_id||payload.id||"");
   await admin.from("mail_merge_campaign_recipients").update({status:"Sent",sent_at:now,provider_message_id:providerId,provider_thread_id:providerThreadId,updated_at:now}).eq("id",row.id);
   await admin.from("master_leads").update({last_contacted_at:now,current_status:"Fresh Outreach",updated_at:now}).eq("id",lead.id);
   const {data:acct}=await admin.from("outbound_email_accounts").select("total_sent").eq("id",row.sender_account_id).single();
   await admin.from("outbound_email_accounts").update({last_sent_at:now,total_sent:Number(acct?.total_sent||0)+1}).eq("id",row.sender_account_id);
   await admin.from("mail_merge_events").insert({campaign_recipient_id:row.id,campaign_id:campaignId,lead_id:lead.id,sender_account_id:row.sender_account_id,actor_id:profile.id,event_type:"sent",details:{provider_message_id:providerId}});
   sent++;
  }catch(e){const msg=e instanceof Error?e.message:"Provider dispatch failed";await admin.from("mail_merge_campaign_recipients").update({status:"Failed",failed_at:new Date().toISOString(),error_message:msg,updated_at:new Date().toISOString()}).eq("id",row.id);await admin.from("mail_merge_events").insert({campaign_recipient_id:row.id,campaign_id:campaignId,lead_id:lead.id,sender_account_id:row.sender_account_id,actor_id:profile.id,event_type:"send_failed",details:{error:msg}});failed++;}
 }
 const remaining=(await admin.from("mail_merge_campaign_recipients").select("id",{count:"exact",head:true}).eq("campaign_id",campaignId).eq("status","Queued")).count||0;
 if(!remaining)await admin.from("mail_merge_campaigns").update({status:failed?"Paused":"Completed",updated_at:new Date().toISOString()}).eq("id",campaignId);
 return NextResponse.json({sent,failed,remaining});
}
