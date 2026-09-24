import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;
const num=(v:unknown)=>{const x=Number(String(v??"").replace(/[%,$,]/g,""));return Number.isFinite(x)?x:0};
export async function POST(request: Request) {
  const auth = await requireOutboundUser(request, ["admin","manager"]); if ("error" in auth) return auth.error;
  const { admin } = auth; const body = await request.json().catch(() => null); const rows = Array.isArray(body?.rows) ? body.rows : []; const meta = body?.meta ?? {};
  if (!rows.length || rows.length > 10000) return NextResponse.json({ error: "Provide 1–10,000 historical rows per import." }, { status: 400 });
  const importBatchId = crypto.randomUUID(); const { data: profiles } = await admin.from("outbound_profiles").select("id,full_name");
  const profileByName = new Map((profiles ?? []).map((p:{id:string;full_name:string})=>[p.full_name.trim().toLowerCase(),p.id]));
  const normalized = rows.map((row:Record<string,unknown>)=>{
    const employeeName=String(row.employee_name??"").trim();
    return {
      activity_date:String(row.activity_date??"").slice(0,10), employee_id:profileByName.get(employeeName.toLowerCase())??null, employee_name:employeeName,
      email_account_text:String(row.email_account_text??row.account??"").trim(), prospect_email:String(row.prospect_email??row.account??"").trim(),
      company:String(row.company??""), industry:String(row.industry??""), region:String(row.region??""), lead_source:String(row.lead_source??""), campaign:String(row.campaign??""),
      sequence_id:typeof row.sequence_id==="string"?row.sequence_id:null, stage:String(row.stage??""), subject:String(row.subject??""), content:String(row.content??""),
      content_link:String(row.content_link??""), content_creator:String(row.content_creator??""), outreach_volume:num(row.outreach_volume), open_count:num(row.open_count),
      open_rate:num(row.open_rate), positive_replies:num(row.positive_replies), neutral_replies:num(row.neutral_replies), negative_replies:num(row.negative_replies),
      unsubscribes:num(row.unsubscribes), bounced:num(row.bounced), auto_responses:num(row.auto_responses), clicks:num(row.clicks), bounce_rate:num(row.bounce_rate),
      qualified_leads:num(row.qualified_leads), follow_ups:num(row.follow_ups), freshness:row.freshness==="recycled"?"recycled":"fresh",
      channel:row.channel==="contact_form"?"contact_form":"cold_email", source_file:String(meta.file_name??""), source_sheet:String(row.source_sheet??meta.sheet_name??""),
      source_row:num(row.source_row), imported_at:new Date().toISOString(), import_batch_id:importBatchId
    };
  });
  const invalid=normalized.findIndex((r: { activity_date: string; prospect_email: string })=>!r.activity_date||!r.prospect_email);
  if(invalid>=0)return NextResponse.json({error:"Historical row "+(invalid+1)+" needs an activity date and account/prospect email."},{status:400});
  const {error}=await admin.from("outbound_activities").insert(normalized);
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({importBatchId,inserted:normalized.length});
}
