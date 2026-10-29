import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
export const runtime="nodejs"; export const dynamic="force-dynamic";
const SENT_STATUSES=new Set(["Sent","Replied","Auto Response","Bounced"]);
export async function GET(request:Request){
 const auth=await requireOutboundUser(request);if("error" in auth)return auth.error;
 const {admin,profile}=auth;const {searchParams}=new URL(request.url);
 const country=searchParams.get("country")||"",group=searchParams.get("group")||"",account=searchParams.get("account")||"";
 const [{data:campaigns,error:cErr},{data:leads,error:lErr},{data:accounts,error:aErr},{data:batches,error:bErr}]=await Promise.all([
  profile.role==="member"?admin.from("mail_merge_campaigns").select("*").eq("created_by",profile.id).order("created_at",{ascending:false}).limit(500):admin.from("mail_merge_campaigns").select("*").order("created_at",{ascending:false}).limit(500),
  admin.from("master_leads").select("id,country,current_status,response_classification,suppression_status,last_contacted_at,last_replied_at"),
  profile.role==="member"?admin.from("outbound_email_accounts").select("id,email,health_status,connection_status,daily_send_limit,hourly_send_limit,connection_error").eq("employee_id",profile.id):admin.from("outbound_email_accounts").select("id,email,health_status,connection_status,daily_send_limit,hourly_send_limit,connection_error"),
  profile.role==="member"?admin.from("lead_import_batches").select("*").eq("imported_by",profile.id).order("started_at",{ascending:false}).limit(200):admin.from("lead_import_batches").select("*").order("started_at",{ascending:false}).limit(200)
 ]);
 if(cErr||lErr||aErr||bErr)return NextResponse.json({error:cErr?.message||lErr?.message||aErr?.message||bErr?.message},{status:500});
 const allRecipients:any[]=[];
 for(let offset=0;offset<50000;offset+=1000){const {data:page,error}=await admin.from("mail_merge_campaign_recipients").select("*").range(offset,offset+999);if(error)return NextResponse.json({error:error.message},{status:500});allRecipients.push(...(page||[]));if(!page||page.length<1000)break;}
 const sentEvents:any[]=[];
 for(let offset=0;offset<50000;offset+=1000){const {data:page,error}=await admin.from("mail_merge_events").select("campaign_id,campaign_recipient_id,event_type").eq("event_type","sent").range(offset,offset+999);if(error)return NextResponse.json({error:error.message},{status:500});sentEvents.push(...(page||[]));if(!page||page.length<1000)break;}
 const bounceEvents:any[]=[];
 for(let offset=0;offset<50000;offset+=1000){const {data:page,error}=await admin.from("mail_merge_events").select("campaign_id,campaign_recipient_id,event_type").ilike("event_type","%bounce%").range(offset,offset+999);if(error)return NextResponse.json({error:error.message},{status:500});bounceEvents.push(...(page||[]));if(!page||page.length<1000)break;}
 const cs=(campaigns||[]).filter((c:any)=>(!country||c.country===country)&&(!group||c.campaign_group===group)&&(!account||allRecipients.some((r:any)=>r.campaign_id===c.id&&r.sender_account_id===account)));
 const accountMap=new Map((accounts||[]).map((a:any)=>[String(a.id),a]));
 const leadMap=new Map((leads||[]).map((l:any)=>[String(l.id),l]));
 const stageEligible=(campaign:any,r:any)=>{
  const l=leadMap.get(String(r.lead_id||""));
  if(!l||l.suppression_reason||["Bounced","Unsubscribed","Suppressed","Positive","Neutral","Negative","Needs Review"].includes(String(l.current_status||"")))return false;
  const contacted=Boolean(l.last_contacted_at);
  const group=String(campaign.campaign_group||"");
  if(group==="Fresh Outreach")return !contacted;
  if(group==="Follow-up 1")return l.current_status==="Fresh Outreach"&&contacted;
  if(group==="Follow-up 2")return l.current_status==="Follow-up 1"&&contacted;
  if(group==="Follow-up 3")return l.current_status==="Follow-up 2"&&contacted;
  return true;
 };
 const sentByCampaign=new Map();
 for(const event of sentEvents){const campaignId=String(event.campaign_id||""),recipientId=String(event.campaign_recipient_id||"");if(!campaignId||!recipientId)continue;const ids=sentByCampaign.get(campaignId)||new Set();ids.add(recipientId);sentByCampaign.set(campaignId,ids);}
 const pauseReason=(campaign:any,rs:any[])=>{
  if(campaign.status!=="Paused")return null;
  const ready=rs.filter((r:any)=>r.status==="Ready"),queued=rs.filter((r:any)=>r.status==="Queued"),sending=rs.filter((r:any)=>r.status==="Sending"),failed=rs.filter((r:any)=>r.status==="Failed"),suppressed=rs.filter((r:any)=>r.status==="Suppressed"),bounced=rs.filter((r:any)=>r.status==="Bounced");
  const stageReady=ready,stageQueued=queued;
  const stageIneligible=0;
  if(stageReady.length||stageQueued.length){
   const dispatchable=[...stageReady,...stageQueued];
   const readyAccounts=[...new Set(dispatchable.map((r:any)=>String(r.sender_account_id||"")).filter(Boolean))];
   const disconnected=readyAccounts.some(id=>{const a=accountMap.get(id);return !a||a.health_status==="Paused"||a.connection_status!=="Connected";});
   if(disconnected)return "Paused — one or more sending accounts need reconnection or health review.";
   const now=Date.now(),dayStart=new Date();dayStart.setHours(0,0,0,0);const hourStart=now-60*60*1000;
   const capacityAvailable=readyAccounts.some(id=>{const a=accountMap.get(id);if(!a)return false;const sentToday=allRecipients.filter((r:any)=>String(r.sender_account_id||"")===id&&r.sent_at&&new Date(r.sent_at).getTime()>=dayStart.getTime()).length;const sentHour=allRecipients.filter((r:any)=>String(r.sender_account_id||"")===id&&r.sent_at&&new Date(r.sent_at).getTime()>=hourStart).length;return sentToday<Number(a.daily_send_limit||100)&&sentHour<Number(a.hourly_send_limit||20);});
   if(!capacityAvailable)return "Paused — sending account daily/hourly capacity is currently exhausted.";
   return "Paused — "+(stageIneligible?stageIneligible+" queued/ready recipient(s) are no longer eligible; ":"")+"remaining eligible recipients are ready to dispatch.";
  }
  if(stageIneligible)return "Paused — "+stageIneligible+" remaining recipient(s) no longer match the Master Lead Sheet campaign-stage eligibility.";
  if(sending.length)return "Paused — "+sending.length+" currently sending. Resume dispatch to continue.";
  if(failed.length)return "Paused — "+failed.length+" send failure(s) need review before retry.";
  if(bounced.length)return "Paused — "+bounced.length+" bounced recipient(s) are suppressed from further outreach.";
  if(suppressed.length)return "Paused — "+suppressed.length+" recipient(s) are suppressed and cannot be sent.";
  return "Paused — no dispatchable recipients remain.";
 };
 const rows=cs.map((c:any)=>{
  const rs=allRecipients.filter((r:any)=>r.campaign_id===c.id);
  const sentFromEvents=sentByCampaign.get(String(c.id))||new Set();
  const sentRecipients=rs.filter((r:any)=>Boolean(r.sent_at)||SENT_STATUSES.has(String(r.status)));
  const sentIds=new Set([...Array.from(sentFromEvents),...sentRecipients.map((r:any)=>String(r.id))]);
  const sent=sentIds.size;
  const bounceIds=new Set([
    ...rs.filter((r:any)=>r.status==="Bounced").map((r:any)=>String(r.id)),
    ...bounceEvents.filter((e:any)=>String(e.campaign_id||"")===String(c.id)&&e.campaign_recipient_id).map((e:any)=>String(e.campaign_recipient_id))
  ]);
  const ready=rs.filter((r:any)=>r.status==="Ready").length,queued=rs.filter((r:any)=>r.status==="Queued").length,sending=rs.filter((r:any)=>r.status==="Sending").length,failed=rs.filter((r:any)=>r.status==="Failed").length,skipped=rs.filter((r:any)=>r.status==="Skipped").length,suppressed=rs.filter((r:any)=>r.status==="Suppressed").length,bounced=bounceIds.size,replies=rs.filter((r:any)=>r.status==="Replied").length,autoResponses=rs.filter((r:any)=>r.status==="Auto Response").length;
  const opens=rs.reduce((n:number,r:any)=>n+Number(r.open_count||0),0),positive=rs.filter((r:any)=>r.status==="Replied"&&r.response_classification==="Positive").length,neutral=rs.filter((r:any)=>r.status==="Replied"&&r.response_classification==="Neutral").length,negative=rs.filter((r:any)=>r.status==="Replied"&&r.response_classification==="Negative").length;
  const unsubscribes=(leads||[]).filter((l:any)=>rs.some((r:any)=>r.lead_id===l.id)&&l.current_status==="Unsubscribed").length;
  const eligible=Math.max(0,rs.length-suppressed-skipped);
  const pending=ready+queued+sending;
  const retryable=ready+queued;
  const accounted=Math.min(rs.length,sent+failed+skipped+suppressed+pending);
  return {...c,metrics:{imported:0,recipients:rs.length,eligible,pending,ready,queued,sending,retryable,failed,skipped,suppressed,sent,opens,replies,autoResponses,positive,neutral,negative,bounces:bounced,unsubscribes,completion_rate:eligible?Math.min(100,sent/eligible*100):0,completion_time:c.completed_at&&c.started_at?Math.max(0,new Date(c.completed_at).getTime()-new Date(c.started_at).getTime()):null,status_counts:{Ready:ready,Queued:queued,Sending:sending,Sent:sent,Replied:replies,"Auto Response":autoResponses,Failed:failed,Bounced:bounced,Suppressed:suppressed,Skipped:skipped},data_integrity:{accounted,unaccounted:Math.max(0,rs.length-accounted)},pause_reason:pauseReason(c,rs)}};
 });
 const totals=rows.reduce((a:any,r:any)=>{for(const k of Object.keys(r.metrics))if(typeof r.metrics[k]==="number")a[k]=(a[k]||0)+r.metrics[k];return a},{});
 return NextResponse.json({campaigns:rows,totals,batches:batches||[],accounts:accounts||[],filters:{countries:[...new Set((campaigns||[]).map((c:any)=>c.country).filter(Boolean))],groups:[...new Set((campaigns||[]).map((c:any)=>c.campaign_group).filter(Boolean))]}});
}

export async function POST(request:Request){
 const auth=await requireOutboundUser(request);if("error" in auth)return auth.error;
 const {admin,profile}=auth;const body=await request.json().catch(()=>null);
 const ids=Array.isArray(body?.campaignIds)?[...new Set(body.campaignIds.map(String).filter(Boolean))]:[];
 const requestedDate=typeof body?.activityDate==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(body.activityDate)?body.activityDate:null;
 if(body?.activityDate&&!requestedDate)return NextResponse.json({error:"Report date must be a valid YYYY-MM-DD date."},{status:400});
 if(!ids.length||ids.length>100)return NextResponse.json({error:"Select between 1 and 100 campaigns."},{status:400});
 const {data:campaigns,error:campaignError}=await admin.from("mail_merge_campaigns").select("*").in("id",ids);
 if(campaignError)return NextResponse.json({error:campaignError.message},{status:500});
 if(!campaigns?.length)return NextResponse.json({error:"No selected campaigns were found."},{status:404});
 if(profile.role==="member"&&campaigns.some((c:any)=>c.created_by!==profile.id))return NextResponse.json({error:"You can only add campaigns you created."},{status:403});
 const recipients:any[]=[];
 for(let offset=0;offset<50000;offset+=1000){
  const {data:page,error}=await admin.from("mail_merge_campaign_recipients").select("campaign_id,lead_id,status,sent_at,open_count,subject,body,sender_account_id,response_classification,outbound_email_accounts(id,email,employee_id)").in("campaign_id",ids).in("status",["Sent","Replied","Auto Response","Bounced"]).order("campaign_id",{ascending:true}).order("id",{ascending:true}).range(offset,offset+999);
  if(error)return NextResponse.json({error:error.message},{status:500});
  recipients.push(...(page||[]));
  if(!page||page.length<1000)break;
 }
 const leadIds=[...new Set(recipients.map((r:any)=>String(r.lead_id||"")).filter(Boolean))];
 const leads:any[]=[];
 for(let offset=0;offset<leadIds.length;offset+=1000){
  const batch=leadIds.slice(offset,offset+1000);
  const {data:page,error}=await admin.from("master_leads").select("id,response_classification,current_status").in("id",batch).order("id",{ascending:true});
  if(error)return NextResponse.json({error:error.message},{status:500});
  leads.push(...(page||[]));
 }
 const leadById=new Map((leads||[]).map((l:any)=>[String(l.id),l]));
 const {data:profiles}=await admin.from("outbound_profiles").select("id,full_name");
 const names=new Map((profiles||[]).map((p:any)=>[p.id,p.full_name]));
 let added=0,updated=0,noSent=0;
 for(const campaign of campaigns){
  const campaignRows=(recipients||[]).filter((r:any)=>r.campaign_id===campaign.id);
  if(!campaignRows.length){noSent++;continue;}
  const byAccount=new Map<string,any[]>();
  const accountOf=(row:any)=>Array.isArray(row.outbound_email_accounts)?row.outbound_email_accounts[0]:row.outbound_email_accounts;
  for(const row of campaignRows){const account=accountOf(row);const key=String(row.sender_account_id||"");if(!account?.email||!key)continue;const list=byAccount.get(key)||[];list.push(row);byAccount.set(key,list);}
  for(const rows of byAccount.values()){
   const account=accountOf(rows[0]);
   const sentRows=rows.filter((r:any)=>["Sent","Replied","Auto Response","Bounced"].includes(String(r.status)));
   if(!sentRows.length)continue;
   const opens=sentRows.reduce((sum:number,r:any)=>sum+Number(r.open_count||0),0);
   const replies=sentRows.filter((r:any)=>r.status==="Replied").length;
   const autoResponses=sentRows.filter((r:any)=>r.status==="Auto Response").length;
   const bounced=sentRows.filter((r:any)=>r.status==="Bounced").length;
   const classified=(classification:string)=>sentRows.filter((r:any)=>r.status==="Replied"&&String(r.response_classification||"")===classification).length;
   const unsubscribes=sentRows.filter((r:any)=>String(leadById.get(String(r.lead_id))?.current_status||"")==="Unsubscribed").length;
   const sentDates=sentRows.map((r:any)=>String(r.sent_at||"").slice(0,10)).filter((d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
   const day=requestedDate||sentDates[0]||String(campaign.created_at||new Date().toISOString()).slice(0,10);
   const row={activity_date:day,employee_id:account.employee_id||campaign.created_by,employee_name:String(names.get(account.employee_id)||profile.full_name||""),email_account_text:account.email,prospect_email:account.email,company:campaign.name,region:campaign.country,lead_source:"Mail Merge",campaign:campaign.campaign_group||campaign.name,stage:campaign.campaign_group,subject:String(sentRows[0]?.subject||campaign.subject||""),content:String(sentRows[0]?.body||campaign.body||""),outreach_volume:sentRows.length,open_count:opens,open_rate:sentRows.length?opens/sentRows.length*100:0,positive_replies:classified("Positive"),neutral_replies:classified("Neutral"),negative_replies:classified("Negative"),unsubscribes,bounced,auto_responses:autoResponses,clicks:0,bounce_rate:sentRows.length?bounced/sentRows.length*100:0,qualified_leads:0,follow_ups:0,freshness:"fresh",response_note:"",channel:"cold_email"};
   const {data:existing,error:existingError}=await admin.from("outbound_activities").select("id").eq("channel","cold_email").eq("region",campaign.country).eq("company",campaign.name).eq("email_account_text",account.email).limit(1);
   if(existingError)return NextResponse.json({error:existingError.message},{status:500});
   if(existing?.length){
    const {error:updateError}=await admin.from("outbound_activities").update(row).eq("id",existing[0].id);
    if(updateError)return NextResponse.json({error:updateError.message},{status:500});
    updated++;
   }else{
    const {error:insertError}=await admin.from("outbound_activities").insert(row);
    if(insertError)return NextResponse.json({error:insertError.message},{status:500});
    added++;
   }
  }
 }
 await admin.from("mail_merge_audit_log").insert({actor_id:profile.id,action:"campaigns_added_to_my_outbound",entity_type:"campaign",after_value:{campaign_ids:ids,added,updated,no_sent:noSent}});
 return NextResponse.json({added,updated,noSent,message:"Added "+added+" account report row(s) and refreshed "+updated+" existing row(s) with the latest replies, automatic responses, response classifications, and bounces. "+noSent+" selected campaign(s) had no sent or responded emails."});
}
