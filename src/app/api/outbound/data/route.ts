import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const num=(v:unknown)=>{const x=Number(String(v??"").replace(/[%,$,]/g,""));return Number.isFinite(x)?x:0};
export async function GET(request: Request) {
  const auth = await requireOutboundUser(request);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth; const { searchParams } = new URL(request.url);
  const from = searchParams.get("from"); const to = searchParams.get("to"); const channel = searchParams.get("channel");
  let query = admin.from("outbound_activities").select("*").order("activity_date", { ascending: false }).limit(5000);
  if (profile.role === "member") query = query.eq("employee_id", profile.id);
  if (from) query = query.gte("activity_date", from); if (to) query = query.lte("activity_date", to);
  if (channel && channel !== "all") query = query.eq("channel", channel);
  const [{ data: activities, error }, { data: sequences }, { data: team }] = await Promise.all([
    query, admin.from("outbound_sequences").select("*").eq("active", true).order("created_at"),
    profile.role === "member" ? Promise.resolve({ data: [profile], error: null }) : admin.from("outbound_profiles").select("*").eq("active", true).order("full_name")
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile, activities: activities ?? [], sequences: sequences ?? [], team: team ?? [] });
}
export async function POST(request: Request) {
  const auth = await requireOutboundUser(request);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const body = await request.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length || rows.length > 2000) return NextResponse.json({ error: "Provide 1–2,000 activity rows." }, { status: 400 });

  const normalized = rows.map((row: Record<string, unknown>) => ({
    id: typeof row.id === "string" && row.id ? row.id : undefined,
    activity_date: String(row.activity_date ?? new Date().toISOString().slice(0, 10)).slice(0,10),
    employee_id: profile.role === "member" ? profile.id : (typeof row.employee_id === "string" ? row.employee_id : null),
    employee_name: profile.role === "member" ? profile.full_name : String(row.employee_name ?? ""),
    email_account_id: typeof row.email_account_id === "string" ? row.email_account_id : null,
    email_account_text: String(row.email_account_text ?? row.account ?? "").trim(),
    prospect_email: String(row.prospect_email ?? row.account ?? "").trim(),
    company: String(row.company ?? ""), industry: String(row.industry ?? ""), region: String(row.region ?? ""), lead_source: String(row.lead_source ?? ""),
    campaign: String(row.campaign ?? ""), sequence_id: typeof row.sequence_id === "string" && row.sequence_id ? row.sequence_id : null, stage: String(row.stage ?? ""),
    subject: String(row.subject ?? ""), content: String(row.content ?? ""), content_link: String(row.content_link ?? ""), content_creator: String(row.content_creator ?? ""),
    outreach_volume: num(row.outreach_volume), open_count: num(row.open_count), open_rate: num(row.open_rate), positive_replies: num(row.positive_replies),
    neutral_replies: num(row.neutral_replies), negative_replies: num(row.negative_replies), unsubscribes: num(row.unsubscribes), bounced: num(row.bounced),
    auto_responses: num(row.auto_responses), clicks: num(row.clicks), bounce_rate: num(row.bounce_rate), qualified_leads: num(row.qualified_leads), follow_ups: num(row.follow_ups),
    freshness: row.freshness === "recycled" ? "recycled" : "fresh", response_note: String(row.response_note ?? ""), channel: row.channel === "contact_form" ? "contact_form" : "cold_email",
  }));

  const invalid = normalized.findIndex((r: { prospect_email: string }) => !r.prospect_email);
  if (invalid >= 0) return NextResponse.json({ error: "Row " + (invalid + 1) + " is missing an account/prospect email." }, { status: 400 });

  const hasId = (r: (typeof normalized)[number]): r is (typeof normalized)[number] & { id: string } =>
    typeof r.id === "string" && r.id.length > 0;
  const existingIds = normalized.filter(hasId);
  if (profile.role === "member" && existingIds.length) {
    const ids: string[] = existingIds.map((r: { id: string }) => r.id);
    const { data: owned, error: ownershipError } = await admin.from("outbound_activities").select("id").eq("employee_id", profile.id).in("id", ids);
    if (ownershipError) { console.error("[outbound/data] ownership check failed:", ownershipError); return NextResponse.json({ error: ownershipError.message }, { status: 500 }); }
    const ownedIds = new Set((owned ?? []).map((r: {id:string}) => r.id));
    const foreign = ids.find(id => !ownedIds.has(id));
    if (foreign) return NextResponse.json({ error: "One or more rows cannot be updated by this account." }, { status: 403 });
  }

  const updates = normalized.filter(hasId);
  const inserts = normalized.filter((r: (typeof normalized)[number]) => !r.id).map(({ id: _id, ...values }: (typeof normalized)[number]) => values);
  if (updates.length) {
    const { error } = await Promise.all(updates.map(async (row: (typeof updates)[number]) => {
      const { id, ...values } = row;
      let query = admin.from("outbound_activities").update(values).eq("id", id);
      if (profile.role === "member") query = query.eq("employee_id", profile.id);
      const result = await query;
      return result.error;
    })).then(errors => ({ error: errors.find(Boolean) ?? null }));
    if (error) { console.error("[outbound/data] update failed:", error); return NextResponse.json({ error: error.message }, { status: 500 }); }
  }
  let inserted = 0;
  if (inserts.length) {
    const { data, error } = await admin.from("outbound_activities").insert(inserts).select("id");
    if (error) { console.error("[outbound/data] insert failed:", error); return NextResponse.json({ error: error.message }, { status: 500 }); }
    inserted = data?.length ?? 0;
  }
  return NextResponse.json({ saved: normalized.length, inserted, updated: updates.length });
}
