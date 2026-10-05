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
 const patch={lead_owner:owner,fresh_outreach_assigned_to:fresh,fresh_outreach_assigned_date:new Date().toISOString()};
 const {data:updated,error}=await admin.from("master_leads").update(patch).eq("id",id).select("*").single(); if(error)return NextResponse.json({error:error.message},{status:500});
 await admin.from("lead_activity_events").insert({lead_id:id,actor_id:profile.id,event_type:"ownership_transferred",previous_value:lead.lead_owner,new_value:owner,details:{previous_owner_name:lead.fresh_outreach_assigned_to||null,new_owner_name:person.full_name}});
 await admin.from("mail_merge_audit_log").insert({actor_id:profile.id,action:"lead_owner_transferred",entity_type:"lead",entity_id:id,before_value:{lead_owner:lead.lead_owner},after_value:{lead_owner:owner}});
 return NextResponse.json({lead:updated});
}
