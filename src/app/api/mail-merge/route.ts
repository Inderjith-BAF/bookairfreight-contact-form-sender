import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
export const runtime="nodejs"; export const dynamic="force-dynamic";
const GROUPS=["Fresh Outreach","Follow-up 1","Follow-up 2","Follow-up 3","Custom"] as const;
const STATUSES=["Draft","Ready","Queued","Paused","Completed","Cancelled"] as const;
const manager=(p:any)=>["admin","manager","lead_generation_admin"].includes(p.role);
export async function GET(request:Request){
 const auth=await requireOutboundUser(request); if("error" in auth)return auth.error; const {admin,profile}=auth; const sp=new URL(request.url).searchParams; const id=sp.get("id");
 if(id){const {data:campaign,error}=await admin.from("mail_merge_campaigns").select("*").eq("id",id).maybeSingle(); if(error||!campaign)return NextResponse.json({error:error?.message||"Campaign not found."},{status:404});
  const accountQuery=admin.from("outbound_email_accounts").select("id,email,employee_id,active,daily_send_limit,hourly_send_limit,health_status,total_sent").eq("active",true); if(profile.role==="member")accountQuery.eq("employee_id",profile.id); const [{data:recipients,error:re},{data:accounts}]=await Promise.all([admin.from("mail_merge_campaign_recipients").select("*,master_leads(id,email,company_name,first_name,last_name,country,current_status,suppression_reason,lead_owner)").eq("campaign_id",id).order("created_at"),accountQuery]);
  if(re)return NextResponse.json({error:re.message},{status:500}); const visible=profile.role==="member"?(recipients||[]).filter((r:any)=>r.master_leads?.lead_owner===profile.id):recipients||[]; return NextResponse.json({campaign,recipients:visible,accounts:accounts||[]});
 }
 let q=admin.from("mail_merge_campaigns").select("*").order("created_at",{ascending:false}).limit(100); if(profile.role==="member")q=q.eq("created_by",profile.id);
 const accountQuery=admin.from("outbound_email_accounts").select("id,email,employee_id,active,daily_send_limit,hourly_send_limit,health_status,total_sent").eq("active",true); if(profile.role==="member")accountQuery.eq("employee_id",profile.id); const [{data:campaigns,error},{data:accounts}]=await Promise.all([q,accountQuery]);
 if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({campaigns:campaigns||[],accounts:accounts||[],canManage:manager(profile)});
}
export async function POST(request:Request){
 const auth=await requireOutboundUser(request); if("error" in auth)return auth.error; const {admin,profile}=auth; if(!manager(profile))return NextResponse.json({error:"Campaign creation requires leadership or Lead Generation Admin."},{status:403});
 const b=await request.json().catch(()=>null);
 if(b?.action==="add_account"){
  const email=String(b?.email||"").trim().toLowerCase();
  if(!email||!email.includes("@"))return NextResponse.json({error:"A valid email account address is required."},{status:400});
  const daily=Math.max(1,Number(b?.daily_send_limit||100)); const hourly=Math.max(1,Number(b?.hourly_send_limit||20));
  const {data:account,error}=await admin.from("outbound_email_accounts").insert({email,employee_id:profile.id,active:true,daily_send_limit:daily,hourly_send_limit:hourly,health_status:"Healthy",total_sent:0}).select("id,email,employee_id,active,daily_send_limit,hourly_send_limit,health_status,total_sent").single();
  if(error)return NextResponse.json({error:error.code==="23505"?"That email account already exists.":error.message},{status:500});
  return NextResponse.json({account},{status:201});
 }
 const name=String(b?.name||"").trim(),country=String(b?.country||"").trim(),group=String(b?.campaign_group||"Fresh Outreach"),subject=String(b?.subject||"").trim(),body=String(b?.body||"");
 if(!name||!country||!GROUPS.includes(group as any))return NextResponse.json({error:"Name, country and campaign group are required."},{status:400});
 const {data:campaign,error}=await admin.from("mail_merge_campaigns").insert({name,country,campaign_group:group,subject,body,status:"Draft",created_by:profile.id}).select("*").single();
 if(error)return NextResponse.json({error:error.message},{status:500}); await admin.from("mail_merge_audit_log").insert({actor_id:profile.id,action:"campaign_created",entity_type:"campaign",entity_id:campaign.id,after_value:campaign}); return NextResponse.json({campaign},{status:201});
}
export async function PATCH(request:Request){
 const auth=await requireOutboundUser(request); if("error" in auth)return auth.error; const {admin,profile}=auth; const b=await request.json().catch(()=>null); const id=String(b?.id||""); if(!id)return NextResponse.json({error:"Campaign ID is required."},{status:400});
 const {data:before,error:read}=await admin.from("mail_merge_campaigns").select("*").eq("id",id).maybeSingle(); if(read||!before)return NextResponse.json({error:read?.message||"Campaign not found."},{status:404});
 if(profile.role==="member"||(!manager(profile)&&before.created_by!==profile.id))return NextResponse.json({error:"Not authorized."},{status:403});
 const patch:any={}; for(const k of ["name","country","subject","body","status"])if(b?.[k]!==undefined)patch[k]=String(b[k]); if(b?.campaign_group!==undefined)patch.campaign_group=String(b.campaign_group);
 if(patch.status&&!STATUSES.includes(patch.status))return NextResponse.json({error:"Unsupported campaign status."},{status:400}); if(patch.campaign_group&&!GROUPS.includes(patch.campaign_group))return NextResponse.json({error:"Unsupported campaign group."},{status:400});
 const {data:campaign,error}=await admin.from("mail_merge_campaigns").update({...patch,updated_at:new Date().toISOString()}).eq("id",id).select("*").single(); if(error)return NextResponse.json({error:error.message},{status:500});
 await admin.from("mail_merge_audit_log").insert({actor_id:profile.id,action:"campaign_updated",entity_type:"campaign",entity_id:id,before_value:before,after_value:campaign}); return NextResponse.json({campaign});
}
