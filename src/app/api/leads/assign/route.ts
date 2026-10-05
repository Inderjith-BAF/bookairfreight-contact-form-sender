import {NextResponse} from "next/server";
import {requireOutboundUser} from "@/lib/outbound-auth";
export const runtime="nodejs";
export async function POST(request:Request){
 const auth=await requireOutboundUser(request,["admin","lead_generation_admin"]); if("error" in auth)return auth.error;
 const {admin,profile}=auth; const b=await request.json().catch(()=>null); const id=String(b?.leadId||""), owner=String(b?.leadOwner||"").trim();
 if(!id||!owner)return NextResponse.json({error:"Lead and recipient owner are required."},{status:400});
 const {data:lead,error:le}=await admin.from("master_leads").select("*").eq("id",id).maybeSingle(); if(le||!lead)return NextResponse.json({error:le?.message||"Lead not found."},{status:404});
 const {data:person,error:pe}=await admin.from("outbound_profiles").select("id,full_name,active").eq("id",owner).maybeSingle(); if(pe||!person||!person.active)return NextResponse.json({error:"The selected owner is not an active outbound user."},{status:400});
 const fresh=String(b?.freshOutreachAssignedTo||lead.fresh_outreach_assigned_to||person.full_name).trim();
 const patch={current_workflow_assignee:owner,fresh_outreach_assigned_to:fresh,fresh_outreach_assigned_date:new Date().toISOString()};
 const {data:updated,error}=await admin.from("master_leads").update(patch).eq("id",id).select("*").single(); if(error)return NextResponse.json({error:error.message},{status:500});
 await admin.from("lead_activity_events").insert({lead_id:id,actor_id:profile.id,event_type:"workflow_assignment_changed",previous_value:lead.current_workflow_assignee,new_value:owner,details:{assignment_type:"workflow",original_lead_owner:lead.lead_owner,previous_assignee:lead.current_workflow_assignee,previous_owner_name:lead.fresh_outreach_assigned_to||null,new_owner_name:person.full_name}});
 await admin.from("recipient_assignments").insert({lead_id:id,assignee_id:owner,assignment_type:"workflow",assigned_by:profile.id});
 await admin.from("mail_merge_audit_log").insert({actor_id:profile.id,action:"workflow_assignee_changed",entity_type:"lead",entity_id:id,before_value:{current_workflow_assignee:lead.current_workflow_assignee},after_value:{current_workflow_assignee:owner}});
 return NextResponse.json({lead:updated});
}
