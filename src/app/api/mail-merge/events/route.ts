import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabase";
export const runtime="nodejs";
const responseTypes=["Positive","Neutral","Negative"] as const;
export async function POST(request:Request){
 const secret=process.env.MAIL_MERGE_WEBHOOK_SECRET; if(!secret||request.headers.get("x-mail-merge-secret")!==secret)return NextResponse.json({error:"Unauthorized webhook."},{status:401});
 const admin=getSupabaseAdmin(); if(!admin)return NextResponse.json({error:"Supabase is not configured."},{status:500});
 const b=await request.json().catch(()=>null); const type=String(b?.event_type||"").toLowerCase(); const providerId=String(b?.provider_message_id||b?.message_id||"");
 if(!type)return NextResponse.json({error:"event_type is required."},{status:400});
 let query=admin.from("mail_merge_campaign_recipients").select("*").limit(1); if(providerId)query=query.eq("provider_message_id",providerId);
 else if(b?.email)query=query.eq("lead_id",String(b.lead_id||""));
 const {data:rows}=await query; const row=rows?.[0]; if(!row)return NextResponse.json({accepted:true,matched:false});
 const leadId=row.lead_id; const now=new Date().toISOString(); let status=row.status; const patch:any={updated_at:now};
 if(type.includes("bounce")){status="Bounced";patch.status=status;patch.error_message=String(b?.reason||"Provider reported bounce");await admin.from("master_leads").update({current_status:"Bounced",suppression_reason:"Bounce reported by provider",suppressed_at:now,updated_at:now}).eq("id",leadId);}
 else if(type.includes("unsubscribe")){status="Suppressed";patch.status=status;patch.error_message="Unsubscribe reported by provider";await admin.from("master_leads").update({current_status:"Unsubscribed",suppression_reason:"Unsubscribe reported by provider",suppressed_at:now,updated_at:now}).eq("id",leadId);}
 else if(type.includes("reply")){const cls=responseTypes.includes(String(b?.classification) as any)?String(b.classification):"Needs Review";status="Replied";patch.status=status;await admin.from("master_leads").update({current_status:cls,response_classification:responseTypes.includes(cls as any)?cls:null,last_replied_at:now,updated_at:now,...(responseTypes.includes(cls as any)?{suppression_reason:"Response received",suppressed_at:now}:{})}).eq("id",leadId);}
 else if(type.includes("open")){patch.open_count=Number(row.open_count||0)+1;}
 else if(type.includes("click")){patch.click_count=Number(row.click_count||0)+1;}
 else if(type.includes("ooo")||type.includes("out_of_office")){await admin.from("master_leads").update({current_status:"Out of Office",last_replied_at:now,updated_at:now}).eq("id",leadId);}
 else return NextResponse.json({accepted:true,matched:true,ignored:true});
 await admin.from("mail_merge_campaign_recipients").update({...patch,status}).eq("id",row.id);
 await admin.from("mail_merge_events").insert({campaign_recipient_id:row.id,campaign_id:row.campaign_id,lead_id:leadId,sender_account_id:row.sender_account_id,event_type:type,details:b||{}});
 return NextResponse.json({accepted:true,matched:true,status});
}
