import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (value: unknown) => String(value ?? "").trim() || "Not specified";
const countBy = (rows: Record<string, unknown>[], field: string) => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = clean(row[field]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};

export async function GET(request: Request) {
  const auth = await requireOutboundUser(request);
  if ("error" in auth) return auth.error;
  const { admin } = auth;
  const { count, error: countError } = await admin.from("central_lead_inventory").select("id", { count: "exact", head: true });
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  const total = count || 0;
  const pageSize = 1000;
  const pageCount = Math.ceil(total / pageSize);
  const pages = await Promise.all(Array.from({ length: pageCount }, (_, page) =>
    admin.from("central_lead_inventory")
      .select("created_at,fresh_outreach_assigned_to,business_personal_email,data_from_lead_generation_team,data_source,country,main_industry")
      .order("created_at", { ascending: false })
      .range(page * pageSize, Math.min(total - 1, (page + 1) * pageSize - 1))
  ));
  const failed = pages.find(page => page.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  const rows = pages.flatMap(page => page.data || []);
  const today = new Date();
  const todayKey = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  const last7 = new Map<string, number>();
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
    last7.set(key, 0);
  }
  let assigned = 0, business = 0, personal = 0, addedToday = 0;
  for (const row of rows) {
    if (String(row.fresh_outreach_assigned_to || "").trim()) assigned++;
    if (/business/i.test(String(row.business_personal_email || ""))) business++;
    if (/personal/i.test(String(row.business_personal_email || ""))) personal++;
    const day = String(row.created_at || "").slice(0, 10);
    if (day === todayKey) addedToday++;
    if (last7.has(day)) last7.set(day, (last7.get(day) || 0) + 1);
  }
  return NextResponse.json({
    total, addedToday, assigned, business, personal,
    sources: countBy(rows, "data_from_lead_generation_team"),
    rawSheets: countBy(rows, "data_source"),
    countries: countBy(rows, "country"),
    industries: countBy(rows, "main_industry"),
    last7: [...last7.entries()].map(([key, count]) => ({ key, count }))
  });
}
