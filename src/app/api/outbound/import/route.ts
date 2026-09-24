import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;
export async function POST(request: Request) {
  const auth = await requireOutboundUser(request, ["admin", "manager"]);
  if ("error" in auth) return auth.error;
  const { admin } = auth; const body = await request.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : []; const meta = body?.meta ?? {};
  if (!rows.length || rows.length > 10000) return NextResponse.json({ error: "Provide 1–10,000 historical rows per import." }, { status: 400 });
  const importBatchId = crypto.randomUUID();
  const { data: profiles } = await admin.from("outbound_profiles").select("id,full_name");
  const profileByName = new Map((profiles ?? []).map((p: {id:string;full_name:string}) => [p.full_name.trim().toLowerCase(), p.id]));
  const normalized = rows.map((row: Record<string, unknown>) => {
    const employeeName = String(row.employee_name ?? "").trim();
    return {
      ...row, import_batch_id: importBatchId, imported_at: new Date().toISOString(), source_file: String(meta.file_name ?? ""),
      source_sheet: String(row.source_sheet ?? meta.sheet_name ?? ""), employee_name: employeeName,
      employee_id: profileByName.get(employeeName.toLowerCase()) ?? null, email_account_text: String(row.email_account_text ?? row.account ?? "").trim(),
      channel: row.channel === "contact_form" ? "contact_form" : "cold_email", activity_date: String(row.activity_date ?? "").slice(0, 10),
      prospect_email: String(row.prospect_email ?? row.account ?? "").trim(), outreach_volume: Number(row.outreach_volume ?? 0) || 0,
      open_count: Number(row.open_count ?? 0) || 0, open_rate: Number(row.open_rate ?? 0) || 0, positive_replies: Number(row.positive_replies ?? 0) || 0,
      neutral_replies: Number(row.neutral_replies ?? 0) || 0, negative_replies: Number(row.negative_replies ?? 0) || 0, unsubscribes: Number(row.unsubscribes ?? 0) || 0,
      bounced: Number(row.bounced ?? 0) || 0, auto_responses: Number(row.auto_responses ?? 0) || 0, clicks: Number(row.clicks ?? 0) || 0,
      bounce_rate: Number(row.bounce_rate ?? 0) || 0, qualified_leads: Number(row.qualified_leads ?? 0) || 0, follow_ups: Number(row.follow_ups ?? 0) || 0,
      freshness: row.freshness === "recycled" ? "recycled" : "fresh",
    };
  });
  const invalid = normalized.findIndex((r: Record<string, unknown>) => !r.activity_date || !r.prospect_email);
  if (invalid >= 0) return NextResponse.json({ error: "Historical row " + (invalid + 1) + " needs an activity date and account/prospect email." }, { status: 400 });
  const { error } = await admin.from("outbound_activities").insert(normalized);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ importBatchId, inserted: normalized.length });
}
