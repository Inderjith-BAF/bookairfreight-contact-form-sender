import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
import { render } from "@/lib/mail-merge";
export const runtime="nodejs";
export async function POST(request:Request){
 const auth=await requireOutboundUser(request); if("error" in auth)return auth.error; const {admin,profile}=auth; const b=await request.json().catch(()=>null);
 const campaignId=String(b?.campaignId||""); const leadIds=Array.isArray(b?.leadIds)?b.leadIds.map(String):[]; const senderAccountId=String(b?.senderAccountId||""); const batchId=String(b?.batchId||"").trim(); const subjectOverride=typeof b?.subjectOverride==="string"?b.subjectOverride:""; const bodyOverride=typeof b?.bodyOverride==="string"?b.bodyOverride:"";
 if(!campaignId||!leadIds.length||!senderAccountId||!batchId)return NextResponse.json({error:"Campaign, recipients, sender account and message batch are required."},{status:400});
 if(leadIds.length>10)return NextResponse.json({error:"A message batch can contain at most 10 recipients."},{status:400});
 if(leadIds.length>1000)return NextResponse.json({error:"Select at most 1,000 recipients at a time."},{status:400});
 const [{data:campaign,error:ce},{data:account,error:ae}]=await Promise.all([admin.from("mail_merge_campaigns").select("*").eq("id",campaignId).maybeSingle(),admin.from("outbound_email_accounts").select("*").eq("id",senderAccountId).maybeSingle()]);
 if(ce||!campaign)return NextResponse.json({error:ce?.message||"Campaign not found."},{status:404});
 if(ae||!account||!account.active||account.health_status==="Paused")return NextResponse.json({error:"Sender account is unavailable or paused."},{status:400});
 if(account.employee_id!==profile.id&&!["admin","manager","lead_generation_admin"].includes(profile.role))return NextResponse.json({error:"You can only use sender accounts assigned to you."},{status:403});
 const {data:leads,error}=await admin.from("master_leads").select("*").in("id",leadIds); if(error)return NextResponse.json({error:error.message},{status:500});
 const blocked=(leads||[]).filter((l:any)=>l.suppression_reason||["Bounced","Unsubscribed","Suppressed","Positive","Neutral","Negative"].includes(l.current_status));
 const eligible=(leads||[]).filter((l:any)=>!blocked.some((x:any)=>x.id===l.id)); if(!eligible.length)return NextResponse.json({error:"No selected recipients are eligible to send."},{status:409});
 const {data:existing}=await admin.from("mail_merge_campaign_recipients").select("lead_id").eq("campaign_id",campaignId).in("lead_id",eligible.map((l:any)=>l.id)); const seen=new Set((existing||[]).map((x:any)=>x.lead_id)); const fresh=eligible.filter((l:any)=>!seen.has(l.id));
 if(!fresh.length)return NextResponse.json({error:"All selected recipients are already in this campaign."},{status:409});
 const rows=fresh.map((lead:any)=>({campaign_id:campaignId,lead_id:lead.id,sender_account_id:senderAccountId,batch_id:batchId,subject:render(subjectOverride||campaign.subject,lead),body:render(bodyOverride||campaign.body,lead),status:"Ready"}));
 const {data:inserted,error:ie}=await admin.from("mail_merge_campaign_recipients").insert(rows).select("*"); if(ie)return NextResponse.json({error:ie.message},{status:500});
 await admin.from("mail_merge_audit_log").insert({actor_id:profile.id,action:"recipients_added",entity_type:"campaign",entity_id:campaignId,after_value:{count:inserted?.length||0,sender_account_id:senderAccountId}});
 return NextResponse.json({added:inserted?.length||0,skipped:eligible.length-fresh.length,blocked:blocked.length});
}
