import { NextResponse } from "next/server"; import { requireOutboundUser } from "@/lib/outbound-auth";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:Request){const auth=await requireOutboundUser(request);if("error" in auth)return auth.error;const {admin,profile}=auth;const {searchParams}=new URL(request.url);
const country=searchParams.get("country")||"",group=searchParams.get("group")||"",account=searchParams.get("account")||"";
const [{data:campaigns,error:cErr},{data:recipients,error:rErr},{data:leads,error:lErr},{data:accounts,error:aErr},{data:batches,error:bErr}]=await Promise.all([
 profile.role==="member" ? admin.from("mail_merge_campaigns").select("*").eq("created_by",profile.id).order("created_at",{ascending:false}).limit(500) : admin.from("mail_merge_campaigns").select("*").order("created_at",{ascending:false}).limit(500),
 admin.from("mail_merge_campaign_recipients").select("*").range(0,999),
 admin.from("master_leads").select("id,country,current_status,response_classification,suppression_status,last_contacted_at,last_replied_at"),
 profile.role==="member" ? admin.from("outbound_email_accounts").select("id,email,health_status").eq("employee_id",profile.id) : admin.from("outbound_email_accounts").select("id,email,health_status"),
 profile.role==="member" ? admin.from("lead_import_batches").select("*").eq("imported_by",profile.id).order("started_at",{ascending:false}).limit(200) : admin.from("lead_import_batches").select("*").order("started_at",{ascending:false}).limit(200)
]);if(cErr||rErr||lErr||aErr||bErr)return NextResponse.json({error:cErr?.message||rErr?.message||lErr?.message||aErr?.message||bErr?.message},{status:500});
let allRecipients:any[]=[...(recipients||[])]; if(!rErr){for(let offset=1000;offset<50000;offset+=1000){const {data:page,error:pageError}=await admin.from("mail_merge_campaign_recipients").select("*").range(offset,offset+999);if(pageError)return NextResponse.json({error:pageError.message},{status:500});allRecipients.push(...(page||[]));if(!page||page.length<1000)break;}}
const cs=(campaigns||[]).filter((c:any)=>(!country||c.country===country)&&(!group||c.campaign_group===group)&&(!account||((allRecipients||[]).filter((r:any)=>r.campaign_id===c.id).some((r:any)=>r.sender_account_id===account))));
const rows=cs.map((c:any)=>{const rs=(allRecipients||[]).filter((r:any)=>r.campaign_id===c.id);const sent=rs.filter((r:any)=>r.status==="Sent").length;const opens=rs.reduce((n:any,r:any)=>n+Number(r.open_count||0),0);const replies=rs.filter((r:any)=>r.status==="Replied").length;const autoResponses=rs.filter((r:any)=>r.status==="Auto Response").length;const bounces=rs.filter((r:any)=>["Bounced","Failed"].includes(r.status)).length;const suppressed=rs.filter((r:any)=>r.status==="Suppressed").length;const positive=(leads||[]).filter((l:any)=>rs.some((r:any)=>r.lead_id===l.id)&&l.response_classification==="Positive").length;const neutral=(leads||[]).filter((l:any)=>rs.some((r:any)=>r.lead_id===l.id)&&l.response_classification==="Neutral").length;const negative=(leads||[]).filter((l:any)=>rs.some((r:any)=>r.lead_id===l.id)&&l.response_classification==="Negative").length;return {...c,metrics:{imported:0,recipients:rs.length,eligible:rs.filter((r:any)=>r.status!=="Suppressed").length,sent,opens,replies,autoResponses,positive,neutral,negative,bounces,unsubscribes:(leads||[]).filter((l:any)=>rs.some((r:any)=>r.lead_id===l.id)&&l.current_status==="Unsubscribed").length,completion_time:c.completed_at&&c.started_at?Math.max(0,new Date(c.completed_at).getTime()-new Date(c.started_at).getTime()):null}}});
const totals=rows.reduce((a:any,r:any)=>{for(const k of Object.keys(r.metrics)){if(typeof r.metrics[k]==="number")a[k]=(a[k]||0)+r.metrics[k]}return a},{});
return NextResponse.json({campaigns:rows,totals,batches: batches||[],accounts:accounts||[],filters:{countries:[...new Set((campaigns||[]).map((c:any)=>c.country).filter(Boolean))],groups:[...new Set((campaigns||[]).map((c:any)=>c.campaign_group).filter(Boolean))]}})}

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
 const {data:recipients,error:recipientError}=await admin.from("mail_merge_campaign_recipients").select("campaign_id,lead_id,status,sent_at,open_count,subject,body,sender_account_id,outbound_email_accounts(id,email,employee_id)").in("campaign_id",ids).in("status",["Sent","Replied","Auto Response","Bounced"]);
 if(recipientError)return NextResponse.json({error:recipientError.message},{status:500});
 const leadIds=[...new Set((allRecipients||[]).map((r:any)=>String(r.lead_id||"")).filter(Boolean))];
 const {data:leads,error:leadError}=leadIds.length?await admin.from("master_leads").select("id,response_classification,current_status").in("id",leadIds):{data:[],error:null};
 if(leadError)return NextResponse.json({error:leadError.message},{status:500});
 const leadById=new Map((leads||[]).map((l:any)=>[String(l.id),l]));
 const {data:profiles}=await admin.from("outbound_profiles").select("id,full_name");
 const names=new Map((profiles||[]).map((p:any)=>[p.id,p.full_name]));
 let added=0,updated=0,noSent=0;
 for(const campaign of campaigns){
  const campaignRows=(allRecipients||[]).filter((r:any)=>r.campaign_id===campaign.id);
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
   const classified=(classification:string)=>sentRows.filter((r:any)=>String(leadById.get(String(r.lead_id))?.response_classification||"")===classification).length;
   const unsubscribes=sentRows.filter((r:any)=>String(leadById.get(String(r.lead_id))?.current_status||"")==="Unsubscribed").length;
   const sentDates=sentRows.map((r:any)=>String(r.sent_at||"").slice(0,10)).filter((d:string)=>/^\\d{4}-\\d{2}-\\d{2}$/.test(d)).sort();
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
