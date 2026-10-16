import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";

export const runtime="nodejs";

const blockedStatuses=["Bounced","Unsubscribed","Suppressed","Positive","Neutral","Negative","Needs Review"];

function shuffle<T>(items:T[]){
 const copy=[...items];
 for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}
 return copy;
}

export async function POST(request:Request){
 const auth=await requireOutboundUser(request);
 if("error" in auth)return auth.error;
 const {admin,profile}=auth;
 const b=await request.json().catch(()=>null);
 const campaignId=String(b?.campaignId||""); const isRetry=b?.action==="retry";
 if(!campaignId)return NextResponse.json({error:"Campaign ID is required."},{status:400});

 const {data:campaign,error:ce}=await admin.from("mail_merge_campaigns").select("*").eq("id",campaignId).maybeSingle();
 if(ce||!campaign)return NextResponse.json({error:ce?.message||"Campaign not found."},{status:404});
 if(campaign.created_by!==profile.id)return NextResponse.json({error:"This saved campaign belongs to another user."},{status:403});

 const statusQuery=isRetry
  ? admin.from("mail_merge_campaign_recipients").select("*,master_leads(*)").eq("campaign_id",campaignId).in("status",["Ready","Queued"])
  : admin.from("mail_merge_campaign_recipients").select("*,master_leads(*)").eq("campaign_id",campaignId).eq("status","Ready");
 const {data:rows,error}=await statusQuery;
 if(error)return NextResponse.json({error:error.message},{status:500});

 const reasons={disconnected:0,daily_hourly_cap:0,unassigned:0,eligible_blocked:0,campaign_ineligible:0,lead_record_missing:0};
 const trulyBlocked=(rows||[]).filter((r:any)=>{
  const l=r.master_leads;
  return Boolean(l&&(l.suppression_reason||blockedStatuses.includes(String(l.current_status||""))));
 });
 if(trulyBlocked.length){
  reasons.eligible_blocked=trulyBlocked.length;
  await admin.from("mail_merge_campaign_recipients").update({status:"Suppressed",error_message:"Lead has a suppression reason or a blocked response status.",updated_at:new Date().toISOString()}).in("id",trulyBlocked.map((r:any)=>r.id));
 }
 const eligible=(rows||[]).filter((r:any)=>{
  const l=r.master_leads;
  if(!l||l.suppression_reason||blockedStatuses.includes(String(l.current_status||"")))return false;
  // Retry means resume recipients that were already added to this campaign but
  // were never sent. Do not re-apply campaign-stage eligibility here: the lead
  // may have changed status after the original campaign was created, and the
  // user's explicit retry action is to finish this campaign's unsent recipients.
  if(isRetry)return true;
  const group=String(campaign.campaign_group||"");
  if(group==="Fresh Outreach")return !l.last_contacted_at;
  if(group==="Follow-up 1")return l.current_status==="Fresh Outreach"&&Boolean(l.last_contacted_at);
  if(group==="Follow-up 2")return l.current_status==="Follow-up 1"&&Boolean(l.last_contacted_at);
  if(group==="Follow-up 3")return l.current_status==="Follow-up 2"&&Boolean(l.last_contacted_at);
  return true;
 });
 reasons.campaign_ineligible=(rows||[]).filter((r:any)=>{
  const l=r.master_leads;
  if(!l||l.suppression_reason||blockedStatuses.includes(String(l.current_status||"")))return false;
  const group=String(campaign.campaign_group||"");
  return (group==="Fresh Outreach"&&Boolean(l.last_contacted_at))||
   (group==="Follow-up 1"&&!(l.current_status==="Fresh Outreach"&&Boolean(l.last_contacted_at)))||
   (group==="Follow-up 2"&&!(l.current_status==="Follow-up 1"&&Boolean(l.last_contacted_at)))||
   (group==="Follow-up 3"&&!(l.current_status==="Follow-up 2"&&Boolean(l.last_contacted_at)));
 }).length;
 reasons.lead_record_missing=(rows||[]).filter((r:any)=>!r.master_leads).length;

 // A lead can become ineligible for this campaign after the recipient was
 // created or queued (for example, another Follow-up 3 campaign advanced the
 // Master Lead Sheet status). Do not leave those recipients permanently
 // pending; mark them skipped so Retry/Paused state reflects reality.
 const campaignIneligibleRows=isRetry?[]:(rows||[]).filter((r:any)=>!trulyBlocked.some((blocked:any)=>blocked.id===r.id)).filter((r:any)=>{
  const l=r.master_leads;
  if(!l)return false;
  const group=String(campaign.campaign_group||"");
  if(group==="Fresh Outreach")return Boolean(l.last_contacted_at);
  if(group==="Follow-up 1")return !(l.current_status==="Fresh Outreach"&&Boolean(l.last_contacted_at));
  if(group==="Follow-up 2")return !(l.current_status==="Follow-up 1"&&Boolean(l.last_contacted_at));
  if(group==="Follow-up 3")return !(l.current_status==="Follow-up 2"&&Boolean(l.last_contacted_at));
  return false;
 });
 if(campaignIneligibleRows.length){
  await admin.from("mail_merge_campaign_recipients").update({
   status:"Skipped",
   send_not_before:null,
   error_message:"Lead no longer matches the Master Lead Sheet campaign-stage eligibility.",
   updated_at:new Date().toISOString()
  }).in("id",campaignIneligibleRows.map((r:any)=>r.id)).in("status",["Ready","Queued"]);
 }

 const byBatch=new Map<string,any[]>();
 for(const r of shuffle(eligible)){
  const k=`${r.sender_account_id||"unassigned"}::${r.batch_id||"legacy"}`;
  const a=byBatch.get(k)||[];a.push(r);byBatch.set(k,a);
 }
 const remainingDaily=new Map<string,number>();
 const remainingHourly=new Map<string,number>();
 const accountCache=new Map<string,any>();
 const candidates:any[]=[];

 for(const [batchKey,items] of shuffle([...byBatch.entries()])){
  const [sender]=batchKey.split("::");
  if(sender==="unassigned"){reasons.unassigned+=items.length;continue;}
  let account=accountCache.get(sender);
  if(!account){
   const {data}=await admin.from("outbound_email_accounts").select("*").eq("id",sender).maybeSingle();
   account=data;accountCache.set(sender,account);
  }
  if(!account||account.health_status==="Paused"||account.connection_status!=="Connected"||!account.refresh_token_encrypted){
   reasons.disconnected+=items.length;
   if(account?.employee_id){
    const {data:existing}=await admin.from("mail_merge_notifications").select("id").eq("recipient_profile_id",account.employee_id).eq("account_id",account.id).eq("notification_type","account_disconnected").is("read_at",null).maybeSingle();
    if(!existing)await admin.from("mail_merge_notifications").insert({recipient_profile_id:account.employee_id,notification_type:"account_disconnected",account_id:account.id,title:"Email account disconnected",message:account.email+" is not connected and cannot receive this campaign. Reconnect the mailbox before its batch can be dispatched."});
   }
   continue;
  }
  if(!remainingDaily.has(sender)||!remainingHourly.has(sender)){
   const now=new Date();
   const dayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString();
   const hourStart=new Date(now.getTime()-60*60*1000).toISOString();
   const [{count:sentToday},{count:sentHour}]=await Promise.all([
    admin.from("mail_merge_campaign_recipients").select("id",{count:"exact",head:true}).eq("sender_account_id",sender).not("sent_at","is",null).gte("sent_at",dayStart),
    admin.from("mail_merge_campaign_recipients").select("id",{count:"exact",head:true}).eq("sender_account_id",sender).not("sent_at","is",null).gte("sent_at",hourStart)
   ]);
   remainingDaily.set(sender,Math.max(0,Number(account.daily_send_limit||100)-Number(sentToday||0)));
   remainingHourly.set(sender,Math.max(0,Number(account.hourly_send_limit||20)-Number(sentHour||0)));
  }
  const allowed=Math.max(0,Math.min(10,items.length,remainingDaily.get(sender)||0,remainingHourly.get(sender)||0));
  const take=items.slice(0,allowed);
  if(take.length){
   candidates.push(...take);
   remainingDaily.set(sender,(remainingDaily.get(sender)||0)-take.length);
   remainingHourly.set(sender,(remainingHourly.get(sender)||0)-take.length);
  }
  reasons.daily_hourly_cap+=Math.max(0,items.length-take.length);
 }

 let queued=0;
 const now=new Date().toISOString();
 for(const r of candidates){
  const {data:updated,error:updateError}=await admin.from("mail_merge_campaign_recipients").update({status:"Queued",queued_at:now,send_not_before:now,error_message:isRetry?"Retry resumed from Campaign Intelligence.":null,updated_at:now}).eq("id",r.id).eq("status",String(r.status||"Ready")).select("id").maybeSingle();
  if(updateError)return NextResponse.json({error:updateError.message},{status:500});
  if(updated)queued++;
 }

 const skipped=(rows||[]).length-queued;
 const remainingDispatchable=eligible.length-candidates.length;
 const finalStatus=queued?"Queued":remainingDispatchable>0?"Paused":"Completed";
 await admin.from("mail_merge_campaigns").update({status:finalStatus,updated_at:new Date().toISOString()}).eq("id",campaignId);
 await admin.from("mail_merge_audit_log").insert({actor_id:profile.id,action:isRetry?"campaign_retry_queued":"campaign_queued",entity_type:"campaign",entity_id:campaignId,after_value:{queued,skipped,reasons,pacing:"account-level 1/2/3/4/5 minutes",member_order:"independent accounts",parallelism:"all eligible accounts concurrently"}});

 return NextResponse.json({
  queued,skipped,reasons,status:finalStatus,
  message:queued
   ?(isRetry?"Retry queued "+queued+" remaining recipients from where the campaign stopped. Previously queued recipients were resumed without touching already-sent recipients.":"Queued "+queued+" recipients. All eligible sending accounts can run concurrently; each account independently selects a 1, 2, 3, 4, or 5 minute gap.")
   :remainingDispatchable>0
    ?"No recipients could be queued right now. Check mailbox connections and account limits."
    :"No remaining recipients are eligible for this campaign stage. Ineligible recipients were skipped; already-sent recipients were not touched."
 });
}
