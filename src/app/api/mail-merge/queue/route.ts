import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
export const runtime="nodejs";
export async function POST(request:Request){
 const auth=await requireOutboundUser(request); if("error" in auth)return auth.error; const {admin,profile}=auth; const b=await request.json().catch(()=>null); const campaignId=String(b?.campaignId||"");
 if(!campaignId)return NextResponse.json({error:"Campaign ID is required."},{status:400});
 const {data:campaign,error:ce}=await admin.from("mail_merge_campaigns").select("*").eq("id",campaignId).maybeSingle(); if(ce||!campaign)return NextResponse.json({error:ce?.message||"Campaign not found."},{status:404});
 if(profile.role==="member"&&campaign.created_by!==profile.id)return NextResponse.json({error:"Not authorized."},{status:403});
 const {data:rows,error}=await admin.from("mail_merge_campaign_recipients").select("*,master_leads(*)").eq("campaign_id",campaignId).eq("status","Ready"); if(error)return NextResponse.json({error:error.message},{status:500});
 const eligible=(rows||[]).filter((r:any)=>{
  const l=r.master_leads;
  if(!l||l.suppression_reason||["Bounced","Unsubscribed","Suppressed","Positive","Neutral","Negative"].includes(l.current_status))return false;
  if(campaign.campaign_group==="Fresh Outreach"&&l.last_contacted_at)return false;
  if(["Follow-up 1","Follow-up 2","Follow-up 3"].includes(campaign.campaign_group)&&!l.last_contacted_at)return false;
  return true;
});
 const reasons:{disconnected:number;daily_hourly_cap:number;unassigned:number;eligible_blocked:number}={disconnected:0,daily_hourly_cap:0,unassigned:0,eligible_blocked:0};
 const blocked=(rows||[]).filter((r:any)=>!eligible.some((x:any)=>x.id===r.id));
 if(blocked.length){reasons.eligible_blocked=blocked.length;await admin.from("mail_merge_campaign_recipients").update({status:"Suppressed",error_message:"Recipient is suppressed or has a response.",updated_at:new Date().toISOString()}).in("id",blocked.map((r:any)=>r.id));}
 const byBatch=new Map<string,any[]>();
 for(const r of eligible){
  const k=`${r.sender_account_id||"unassigned"}::${r.batch_id||"legacy"}`;
  const a=byBatch.get(k)||[];a.push(r);byBatch.set(k,a);
 }
 const remainingDaily=new Map<string,number>();
 const remainingHourly=new Map<string,number>();
 let queued=0,skipped=0;
 for(const [batchKey,items] of byBatch){
  const [sender]=batchKey.split("::");
  if(sender==="unassigned"){skipped+=items.length;reasons.unassigned+=items.length;continue;}
  const {data:account}=await admin.from("outbound_email_accounts").select("*").eq("id",sender).maybeSingle();
  if(!account||account.health_status==="Paused"||account.connection_status!=="Connected"||!account.refresh_token_encrypted){skipped+=items.length;reasons.disconnected+=items.length;continue;}
  if(!remainingDaily.has(sender)||!remainingHourly.has(sender)){
   const now=new Date();
   const dayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString();
   const hourStart=new Date(now.getTime()-60*60*1000).toISOString();
   const [{count:sentToday},{count:sentHour}]=await Promise.all([
    admin.from("mail_merge_campaign_recipients").select("id",{count:"exact",head:true}).eq("sender_account_id",sender).eq("status","Sent").gte("sent_at",dayStart),
    admin.from("mail_merge_campaign_recipients").select("id",{count:"exact",head:true}).eq("sender_account_id",sender).eq("status","Sent").gte("sent_at",hourStart)
   ]);
   remainingDaily.set(sender,Math.max(0,Number(account.daily_send_limit||100)-Number(sentToday||0)));
   remainingHourly.set(sender,Math.max(0,Number(account.hourly_send_limit||20)-Number(sentHour||0)));
  }
  const allowed=Math.max(0,Math.min(10,items.length,remainingDaily.get(sender)||0,remainingHourly.get(sender)||0));
  const take=items.slice(0,allowed);
  if(take.length){
   const nowDate=new Date();
   const now=nowDate.toISOString();
   // Pace each sending account: one recipient at least every 60 seconds.
   const updates=take.map((r:any,index:number)=>admin.from("mail_merge_campaign_recipients").update({status:"Queued",queued_at:now,send_not_before:new Date(nowDate.getTime()+index*60_000).toISOString(),updated_at:now}).eq("id",r.id));
   await Promise.all(updates);
   queued+=take.length;
   remainingDaily.set(sender,(remainingDaily.get(sender)||0)-take.length);
   remainingHourly.set(sender,(remainingHourly.get(sender)||0)-take.length);
  }
  skipped+=Math.max(0,items.length-take.length);reasons.daily_hourly_cap+=Math.max(0,items.length-take.length);
 }
 await admin.from("mail_merge_campaigns").update({status:queued?"Queued":"Paused",updated_at:new Date().toISOString()}).eq("id",campaignId);
 await admin.from("mail_merge_audit_log").insert({actor_id:profile.id,action:"campaign_queued",entity_type:"campaign",entity_id:campaignId,after_value:{queued,skipped}});
 return NextResponse.json({queued,skipped,reasons,message:queued?"Queued "+queued+" recipients. The 10-recipient message-batch cap and 60-second per-account pacing are enforced; account daily/hourly limits remain enforced.":"No recipients could be queued. Check mailbox connection and account daily/hourly limits.",status:queued?"Queued":"Paused"});
}
