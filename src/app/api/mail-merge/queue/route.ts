import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
export const runtime="nodejs";
export async function POST(request:Request){
 const auth=await requireOutboundUser(request); if("error" in auth)return auth.error; const {admin,profile}=auth; const b=await request.json().catch(()=>null); const campaignId=String(b?.campaignId||"");
 if(!campaignId)return NextResponse.json({error:"Campaign ID is required."},{status:400});
 const {data:campaign,error:ce}=await admin.from("mail_merge_campaigns").select("*").eq("id",campaignId).maybeSingle(); if(ce||!campaign)return NextResponse.json({error:ce?.message||"Campaign not found."},{status:404});
 if(profile.role==="member"&&campaign.created_by!==profile.id)return NextResponse.json({error:"Not authorized."},{status:403});
 const {data:rows,error}=await admin.from("mail_merge_campaign_recipients").select("*,master_leads(*)").eq("campaign_id",campaignId).eq("status","Ready"); if(error)return NextResponse.json({error:error.message},{status:500});
 const eligible=(rows||[]).filter((r:any)=>!r.master_leads?.suppression_reason&&!["Bounced","Unsubscribed","Suppressed","Positive","Neutral","Negative"].includes(r.master_leads?.current_status));
 const blocked=(rows||[]).filter((r:any)=>!eligible.some((x:any)=>x.id===r.id));
 if(blocked.length)await admin.from("mail_merge_campaign_recipients").update({status:"Suppressed",error_message:"Recipient is suppressed or has a response.",updated_at:new Date().toISOString()}).in("id",blocked.map((r:any)=>r.id));
 const bySender=new Map<string,any[]>(); for(const r of eligible){const k=r.sender_account_id||"unassigned";const a=bySender.get(k)||[];a.push(r);bySender.set(k,a);}
 let queued=0,skipped=0;
 for(const [sender,items] of bySender){
  if(sender==="unassigned"){skipped+=items.length;continue;}
  const {data:account}=await admin.from("outbound_email_accounts").select("*").eq("id",sender).maybeSingle();
  if(!account||account.health_status==="Paused"){skipped+=items.length;continue;}
  const {count}=await admin.from("mail_merge_campaign_recipients").select("id",{count:"exact",head:true}).eq("campaign_id",campaignId).eq("sender_account_id",sender).neq("status","Suppressed");
  const allowed=Math.max(0,10-Number(count||0)); const take=items.slice(0,allowed);
  if(take.length){await admin.from("mail_merge_campaign_recipients").update({status:"Queued",queued_at:new Date().toISOString(),updated_at:new Date().toISOString()}).in("id",take.map((r:any)=>r.id));queued+=take.length;}
  skipped+=Math.max(0,items.length-take.length);
 }
 await admin.from("mail_merge_campaigns").update({status:queued?"Queued":"Paused",updated_at:new Date().toISOString()}).eq("id",campaignId);
 await admin.from("mail_merge_audit_log").insert({actor_id:profile.id,action:"campaign_queued",entity_type:"campaign",entity_id:campaignId,after_value:{queued,skipped}});
 return NextResponse.json({queued,skipped,message:queued?"Queued "+queued+" recipients. The 10-recipient subject/account/campaign cap was enforced.":"No recipients could be queued."});
}
