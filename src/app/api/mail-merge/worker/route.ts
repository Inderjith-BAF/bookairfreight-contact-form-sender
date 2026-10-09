import { NextResponse } from "next/server";
import { sendThroughProvider } from "@/lib/mail-merge-provider";
import { signTrackingToken } from "@/lib/mail-merge-tracking";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime="nodejs";
export const maxDuration=60;

function authorized(request:Request){
 const secret=process.env.CRON_SECRET;
 return Boolean(secret&&request.headers.get("authorization")===`Bearer ${secret}`);
}

async function finishCampaign(admin:any,campaignId:string){
 const {count:queued}=await admin.from("mail_merge_campaign_recipients").select("id",{count:"exact",head:true}).eq("campaign_id",campaignId).eq("status","Queued");
 const {count:active}=await admin.from("mail_merge_campaign_recipients").select("id",{count:"exact",head:true}).eq("campaign_id",campaignId).eq("status","Sending");
 const {count:ready}=await admin.from("mail_merge_campaign_recipients").select("id",{count:"exact",head:true}).eq("campaign_id",campaignId).eq("status","Ready");
 if(!queued&&!active) await admin.from("mail_merge_campaigns").update({status:ready?"Paused":"Completed",updated_at:new Date().toISOString()}).eq("id",campaignId);
}

export async function GET(request:Request){
 if(!authorized(request))return NextResponse.json({error:"Unauthorized."},{status:401});
 const admin=getSupabaseAdmin();
 if(!admin)return NextResponse.json({error:"Supabase is not configured."},{status:500});

 const {data:queued,error}=await admin.from("mail_merge_campaign_recipients").select("id,outbound_email_accounts!inner(email)").eq("status","Queued").lte("send_not_before",new Date().toISOString()).limit(100);
 if(error)return NextResponse.json({error:error.message},{status:500});
 if(!queued?.length)return NextResponse.json({sent:0,message:"No domain-level email is due."});

 const domains=[...new Set((queued||[]).map((r:any)=>String(r.outbound_email_accounts?.email||"").split("@")[1]?.toLowerCase()).filter(Boolean))];
 let sent=0,failed=0,disconnected=0;

 for(const domain of domains){
  const {data:claimed,error:claimError}=await admin.rpc("claim_mail_merge_recipient",{p_domain:domain});
  if(claimError||!claimed?.length)continue;
  const claim=claimed[0];
  const {data:row,error:rowError}=await admin.from("mail_merge_campaign_recipients").select("*,master_leads(*),outbound_email_accounts(*)").eq("id",claim.id).maybeSingle();
  if(rowError||!row)continue;
  const lead=row.master_leads;
  const account=row.outbound_email_accounts;
  const campaignId=String(row.campaign_id);
  const {data:campaign}=await admin.from("mail_merge_campaigns").select("id,created_by").eq("id",campaignId).maybeSingle();
  if(!campaign)continue;

  if(!account||account.connection_status!=="Connected"||!account.refresh_token_encrypted){
   await admin.from("mail_merge_campaign_recipients").update({status:"Ready",send_not_before:null,error_message:"Sending account is disconnected. Reconnect the mailbox before dispatch.",updated_at:new Date().toISOString()}).eq("id",row.id);
   disconnected++;
   continue;
  }
  if(!lead||lead.suppression_reason||["Bounced","Unsubscribed","Suppressed","Positive","Neutral","Negative"].includes(lead.current_status)){
   await admin.from("mail_merge_campaign_recipients").update({status:"Suppressed",error_message:"Suppressed before automatic dispatch.",updated_at:new Date().toISOString()}).eq("id",row.id);
   await finishCampaign(admin,campaignId);
   continue;
  }

  try{
   const {data:previousRows}=await admin.from("mail_merge_campaign_recipients").select("id,subject,provider_message_id,provider_thread_id,sent_at").eq("lead_id",lead.id).eq("sender_account_id",row.sender_account_id).in("status",["Sent","Replied"]).not("provider_message_id","is",null).neq("id",row.id).order("sent_at",{ascending:false}).limit(1);
   const previous=previousRows?.[0];
   const sameSubject=Boolean(previous&&String(previous.subject||"").trim().toLowerCase()===String(row.subject||"").trim().toLowerCase());
   const origin=new URL(request.url).origin;
   const trackingBase=(process.env.MAIL_MERGE_TRACKING_BASE_URL||process.env.NEXT_PUBLIC_APP_URL||origin)+"/api/mail-merge/track";
   const trackingToken=signTrackingToken(String(row.id));
   const response=await sendThroughProvider(account,{to:lead.email,subject:String(row.subject||""),body:String(row.body||""),trackingBase,trackingToken,replyToMessageId:sameSubject&&previous?String(previous.provider_message_id):undefined,replyToThreadId:sameSubject&&previous?String(previous.provider_thread_id||""):undefined},admin);
   const now=new Date().toISOString();
   const providerId=String(response.messageId||"");
   const providerThreadId=String(response.threadId||"");
   await admin.from("mail_merge_campaign_recipients").update({status:"Sent",sent_at:now,provider_message_id:providerId,provider_thread_id:providerThreadId||null,updated_at:now,error_message:null}).eq("id",row.id);
   await admin.from("master_leads").update({last_contacted_at:now,current_status:"Fresh Outreach",updated_at:now}).eq("id",lead.id);
   const {data:acct}=await admin.from("outbound_email_accounts").select("total_sent").eq("id",row.sender_account_id).single();
   await admin.from("outbound_email_accounts").update({last_sent_at:now,total_sent:Number(acct?.total_sent||0)+1}).eq("id",row.sender_account_id);
   await admin.from("mail_merge_events").insert({campaign_recipient_id:row.id,campaign_id:campaignId,lead_id:lead.id,sender_account_id:row.sender_account_id,actor_id:campaign.created_by,event_type:"sent",details:{provider_message_id:providerId,provider_thread_id:providerThreadId||null,threaded_reply:sameSubject,dispatcher:"domain"}});
   sent++;
   await finishCampaign(admin,campaignId);
  }catch(error){
   const message=error instanceof Error?error.message:"Provider dispatch failed";
   const {data:currentAccount}=await admin.from("outbound_email_accounts").select("connection_status").eq("id",row.sender_account_id).maybeSingle();
   const isDisconnected=currentAccount?.connection_status==="Disconnected";
   await admin.from("mail_merge_campaign_recipients").update({status:isDisconnected?"Ready":"Failed",failed_at:isDisconnected?null:new Date().toISOString(),send_not_before:null,error_message:message,updated_at:new Date().toISOString()}).eq("id",row.id);
   if(isDisconnected){
    await admin.from("mail_merge_campaign_recipients").update({status:"Ready",send_not_before:null,error_message:"Mailbox disconnected; reconnect the account to resume this batch.",updated_at:new Date().toISOString()}).eq("sender_account_id",row.sender_account_id).eq("status","Queued");
    disconnected++;
   }else failed++;
   await admin.from("mail_merge_events").insert({campaign_recipient_id:row.id,campaign_id:campaignId,lead_id:lead.id,sender_account_id:row.sender_account_id,actor_id:campaign.created_by,event_type:"send_failed",details:{error:message,dispatcher:"domain",account_disconnected:isDisconnected}});
   await finishCampaign(admin,campaignId);
  }
  break;
 }

 return NextResponse.json({sent,failed,disconnected,domain:"bookairfreight.com",message:sent?"Domain dispatcher sent the next scheduled email.":"No email was dispatched."});
}
