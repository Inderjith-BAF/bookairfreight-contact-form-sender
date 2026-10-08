import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";

export const runtime="nodejs";

const blockedStatuses=["Bounced","Unsubscribed","Suppressed","Positive","Neutral","Negative"];

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
 const campaignId=String(b?.campaignId||"");
 if(!campaignId)return NextResponse.json({error:"Campaign ID is required."},{status:400});

 const {data:campaign,error:ce}=await admin.from("mail_merge_campaigns").select("*").eq("id",campaignId).maybeSingle();
 if(ce||!campaign)return NextResponse.json({error:ce?.message||"Campaign not found."},{status:404});
 if(profile.role==="member"&&campaign.created_by!==profile.id)return NextResponse.json({error:"Not authorized."},{status:403});

 const {data:rows,error}=await admin.from("mail_merge_campaign_recipients").select("*,master_leads(*)").eq("campaign_id",campaignId).eq("status","Ready");
 if(error)return NextResponse.json({error:error.message},{status:500});

 const eligible=(rows||[]).filter((r:any)=>{
  const l=r.master_leads;
  if(!l||l.suppression_reason||blockedStatuses.includes(l.current_status))return false;
  if(campaign.campaign_group==="Fresh Outreach"&&l.last_contacted_at)return false;
  if(["Follow-up 1","Follow-up 2","Follow-up 3"].includes(campaign.campaign_group)&&!l.last_contacted_at)return false;
  return true;
 });
 const reasons={disconnected:0,daily_hourly_cap:0,unassigned:0,eligible_blocked:0};
 const blocked=(rows||[]).filter((r:any)=>!eligible.some((x:any)=>x.id===r.id));
 if(blocked.length){
  reasons.eligible_blocked=blocked.length;
  await admin.from("mail_merge_campaign_recipients").update({status:"Suppressed",error_message:"Recipient is suppressed or has a response.",updated_at:new Date().toISOString()}).in("id",blocked.map((r:any)=>r.id));
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
   reasons.disconnected+=items.length;continue;
  }
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
   candidates.push(...take.map((r:any)=>({row:r,domain:String(account.email||"").split("@")[1]?.toLowerCase()||""})));
   remainingDaily.set(sender,(remainingDaily.get(sender)||0)-take.length);
   remainingHourly.set(sender,(remainingHourly.get(sender)||0)-take.length);
  }
  reasons.daily_hourly_cap+=Math.max(0,items.length-take.length);
 }

 const byDomain=new Map<string,any[]>();
 for(const item of candidates){if(!item.domain){reasons.disconnected++;continue;}const list=byDomain.get(item.domain)||[];list.push(item);byDomain.set(item.domain,list);}
 let queued=0;
 for(const [domain,items] of byDomain){
  const {data:slots,error:slotError}=await admin.rpc("reserve_mail_merge_domain_slots",{p_domain:domain,p_count:items.length});
  if(slotError){return NextResponse.json({error:"Could not reserve the domain sending queue: "+slotError.message},{status:500});}
  const ordered=shuffle(items);
  const sortedSlots=[...(slots||[])].sort((a:any,b:any)=>Number(a.slot_index)-Number(b.slot_index));
  for(let i=0;i<ordered.length;i++){
   const r=ordered[i].row;
   const slot=sortedSlots[i]?.send_at;
   if(!slot)continue;
   await admin.from("mail_merge_campaign_recipients").update({status:"Queued",queued_at:new Date().toISOString(),send_not_before:slot,updated_at:new Date().toISOString()}).eq("id",r.id).eq("status","Ready");
   queued++;
  }
 }

 const skipped=(rows||[]).length-queued;
 await admin.from("mail_merge_campaigns").update({status:queued?"Queued":"Paused",updated_at:new Date().toISOString()}).eq("id",campaignId);
 await admin.from("mail_merge_audit_log").insert({actor_id:profile.id,action:"campaign_queued",entity_type:"campaign",entity_id:campaignId,after_value:{queued,skipped,domain_pacing:"30-60 seconds",batch_mode:"randomized"}});

 return NextResponse.json({
  queued,skipped,reasons,status:queued?"Queued":"Paused",
  message:queued
   ?"Queued "+queued+" recipients. Domain-level dispatch is automatic: one email is released approximately every 30-60 seconds across the domain, with batches randomized and account limits still enforced."
   :"No recipients could be queued. Check mailbox connections, account limits, and recipient eligibility."
 });
}
