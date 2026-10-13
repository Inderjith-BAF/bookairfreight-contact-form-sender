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

async function dispatchAccount(admin:any,request:Request,accountId:string){
 const {data:claimed,error:claimError}=await admin.rpc("claim_mail_merge_account_recipient",{p_account_id:accountId});
 if(claimError)return {sent:0,failed:0,disconnected:0,error:claimError.message};
 if(!claimed?.length){
  const [{data:account},{data:dispatcher},{data:oldest}] = await Promise.all([
   admin.from("outbound_email_accounts").select("id,email,employee_id").eq("id",accountId).maybeSingle(),
   admin.from("mail_merge_account_dispatchers").select("next_send_at").eq("account_id",accountId).maybeSingle(),
   admin.from("mail_merge_campaign_recipients").select("id,campaign_id,batch_id,status,created_at,send_not_before").eq("sender_account_id",accountId).in("status",["Queued","Sending"]).order("created_at").limit(1)
  ]);
  return {sent:0,failed:0,disconnected:0,skipped:{
   account_id:accountId,
   email:account?.email??"unknown",
   employee_id:account?.employee_id??null,
   reason:"claim function returned no recipient",
   next_send_at:dispatcher?.next_send_at??null,
   oldest_outstanding:oldest?.[0]??null
  }};
}
 const {data:row,error:rowError}=await admin.from("mail_merge_campaign_recipients").select("*,master_leads(*),outbound_email_accounts(*)").eq("id",claimed[0].id).maybeSingle();
 if(rowError||!row)return {sent:0,failed:0,disconnected:0,error:rowError?.message||"Claimed recipient could not be loaded."};
 const lead=row.master_leads,account=row.outbound_email_accounts,campaignId=String(row.campaign_id);
 const {data:campaign}=await admin.from("mail_merge_campaigns").select("id,created_by").eq("id",campaignId).maybeSingle();
 if(!campaign)return {sent:0,failed:1,disconnected:0,error:"Campaign not found for claimed recipient."};

 if(!account||account.connection_status!=="Connected"||!account.refresh_token_encrypted){
  await admin.from("mail_merge_campaign_recipients").update({status:"Ready",send_not_before:null,error_message:"Sending account is disconnected. Reconnect the mailbox before dispatch.",updated_at:new Date().toISOString()}).eq("id",row.id);
  return {sent:0,failed:0,disconnected:1};
 }
 if(!lead||lead.suppression_reason||["Bounced","Unsubscribed","Suppressed","Positive","Neutral","Negative","Needs Review"].includes(lead.current_status)){
  await admin.from("mail_merge_campaign_recipients").update({status:"Suppressed",error_message:"Suppressed before automatic dispatch.",updated_at:new Date().toISOString()}).eq("id",row.id);
  await finishCampaign(admin,campaignId);
  return {sent:0,failed:0,disconnected:0};
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
  const providerId=String(response.messageId||""),providerThreadId=String(response.threadId||"");
  await admin.from("mail_merge_campaign_recipients").update({status:"Sent",sent_at:now,provider_message_id:providerId,provider_thread_id:providerThreadId||null,updated_at:now,error_message:null}).eq("id",row.id);
  await admin.from("master_leads").update({last_contacted_at:now,current_status:"Fresh Outreach",updated_at:now}).eq("id",lead.id);
  const {data:acct}=await admin.from("outbound_email_accounts").select("total_sent").eq("id",row.sender_account_id).single();
  await admin.from("outbound_email_accounts").update({last_sent_at:now,total_sent:Number(acct?.total_sent||0)+1}).eq("id",row.sender_account_id);
  await admin.from("mail_merge_events").insert({campaign_recipient_id:row.id,campaign_id:campaignId,lead_id:lead.id,sender_account_id:row.sender_account_id,actor_id:campaign.created_by,event_type:"sent",details:{provider_message_id:providerId,provider_thread_id:providerThreadId||null,threaded_reply:sameSubject,dispatcher:"account",account_id:row.sender_account_id}});
  await finishCampaign(admin,campaignId);
  return {sent:1,failed:0,disconnected:0};
 }catch(error){
  const message=error instanceof Error?error.message:"Provider dispatch failed";
  const {data:currentAccount}=await admin.from("outbound_email_accounts").select("connection_status").eq("id",row.sender_account_id).maybeSingle();
  const isDisconnected=currentAccount?.connection_status==="Disconnected";
  await admin.from("mail_merge_campaign_recipients").update({status:isDisconnected?"Ready":"Failed",failed_at:isDisconnected?null:new Date().toISOString(),send_not_before:null,error_message:message,updated_at:new Date().toISOString()}).eq("id",row.id);
  if(isDisconnected)await admin.from("mail_merge_campaign_recipients").update({status:"Ready",send_not_before:null,error_message:"Mailbox disconnected; reconnect the account to resume this batch.",updated_at:new Date().toISOString()}).eq("sender_account_id",row.sender_account_id).eq("status","Queued");
  await admin.from("mail_merge_events").insert({campaign_recipient_id:row.id,campaign_id:campaignId,lead_id:lead.id,sender_account_id:row.sender_account_id,actor_id:campaign.created_by,event_type:"send_failed",details:{error:message,dispatcher:"account",account_disconnected:isDisconnected}});
  await finishCampaign(admin,campaignId);
  return {sent:0,failed:isDisconnected?0:1,disconnected:isDisconnected?1:0};
 }
}

export async function GET(request:Request){
 if(!authorized(request))return NextResponse.json({error:"Unauthorized."},{status:401});
 const admin=getSupabaseAdmin();
 if(!admin)return NextResponse.json({error:"Supabase is not configured."},{status:500});
 const {data:queued,error}=await admin.from("mail_merge_campaign_recipients").select("sender_account_id").eq("status","Queued").lte("send_not_before",new Date().toISOString()).not("sender_account_id","is",null).limit(200);
 if(error)return NextResponse.json({error:error.message},{status:500});
 const accountIds=[...new Set((queued||[]).map((r:any)=>String(r.sender_account_id)).filter(Boolean))];
 if(!accountIds.length)return NextResponse.json({sent:0,failed:0,disconnected:0,accounts_checked:0,message:"No queued account is due."});
 const results=await Promise.all(accountIds.map((id)=>dispatchAccount(admin,request,id)));
 return NextResponse.json({
  sent:results.reduce((n:number,r:any)=>n+r.sent,0),
  failed:results.reduce((n:number,r:any)=>n+r.failed,0),
  disconnected:results.reduce((n:number,r:any)=>n+r.disconnected,0),
  accounts_checked:accountIds.length,
  errors:results.filter((r:any)=>r.error).map((r:any)=>r.error),
  skipped:results.filter((r:any)=>r.skipped).map((r:any)=>r.skipped),
  message:"Independent account dispatch completed. Accounts run concurrently; batches remain sequential per member and each account has its own 60-120 second pacing timer."
 });
}
