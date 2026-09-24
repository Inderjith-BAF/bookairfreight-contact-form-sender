import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireOutboundUser(request);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from"); const to = searchParams.get("to"); const channel = searchParams.get("channel");
  let query = admin.from("outbound_activities").select("*").order("activity_date", { ascending: false }).limit(5000);
  if (profile.role === "member") query = query.eq("employee_id", profile.id);
  if (from) query = query.gte("activity_date", from); if (to) query = query.lte("activity_date", to);
  if (channel && channel !== "all") query = query.eq("channel", channel);
  const [{ data: activities, error }, { data: sequences }, { data: team }] = await Promise.all([
    query,
    admin.from("outbound_sequences").select("*").eq("active", true).order("created_at"),
    profile.role === "member" ? Promise.resolve({ data: [profile], error: null }) : admin.from("outbound_profiles").select("*").eq("active", true).order("full_name")
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile, activities: activities ?? [], sequences: sequences ?? [], team: team ?? [] });
}
export async function POST(request: Request) {
  const auth = await requireOutboundUser(request);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const body = await request.json().catch(() => null); const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length || rows.length > 2000) return NextResponse.json({ error: "Provide 1–2,000 activity rows." }, { status: 400 });
  const normalized = rows.map((row: Record<string, unknown>) => ({
    ...row,
    employee_id: profile.role === "member" ? profile.id : (typeof row.employee_id === "string" ? row.employee_id : null),
    employee_name: profile.role === "member" ? profile.full_name : String(row.employee_name ?? ""),
    channel: row.channel === "contact_form" ? "contact_form" : "cold_email",
    activity_date: String(row.activity_date ?? new Date().toISOString().slice(0, 10)),
    prospect_email: String(row.prospect_email ?? row.account ?? "").trim(),
    outreach_volume: Number(row.outreach_volume ?? 0) || 0, open_count: Number(row.open_count ?? 0) || 0, open_rate: Number(row.open_rate ?? 0) || 0,
    positive_replies: Number(row.positive_replies ?? 0) || 0, neutral_replies: Number(row.neutral_replies ?? 0) || 0, negative_replies: Number(row.negative_replies ?? 0) || 0,
    unsubscribes: Number(row.unsubscribes ?? 0) || 0, bounced: Number(row.bounced ?? 0) || 0, auto_responses: Number(row.auto_responses ?? 0) || 0,
    clicks: Number(row.clicks ?? 0) || 0, bounce_rate: Number(row.bounce_rate ?? 0) || 0, qualified_leads: Number(row.qualified_leads ?? 0) || 0,
    follow_ups: Number(row.follow_ups ?? 0) || 0, freshness: row.freshness === "recycled" ? "recycled" : "fresh",
  }));
  const invalid = normalized.findIndex((r: Record<string, unknown>) => !r.prospect_email);
  if (invalid >= 0) return NextResponse.json({ error: "Row " + (invalid + 1) + " is missing an account/prospect email." }, { status: 400 });
  const { data, error } = await admin.from("outbound_activities").insert(normalized).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inserted: data?.length ?? 0 });
}
