import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (value: unknown) => String(value ?? "").trim() || "Not specified";
const normalizeCountry = (value: unknown) => {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "Not specified";
  const key = raw.toLowerCase().replace(/[._-]/g, " ").replace(/\s+/g, " ").trim();
  const aliases: Record<string, string> = {
    "australia":"Australia","commonwealth of australia":"Australia","uk":"EU","u k":"EU","gb":"EU","gbr":"EU","great britain":"EU","britain":"EU","england":"EU","scotland":"EU","wales":"EU","northern ireland":"EU","united kingdom":"EU",
    "albania":"EU","andorra":"EU","austria":"EU","belarus":"EU","belgium":"EU","bosnia and herzegovina":"EU","bulgaria":"EU","croatia":"EU","cyprus":"EU","czechia":"EU","denmark":"EU","estonia":"EU","finland":"EU","france":"EU","germany":"EU","greece":"EU","hungary":"EU","iceland":"EU","ireland":"EU","italy":"EU","kosovo":"EU","latvia":"EU","liechtenstein":"EU","lithuania":"EU","luxembourg":"EU","malta":"EU","monaco":"EU","montenegro":"EU","north macedonia":"EU","norway":"EU","poland":"EU","portugal":"EU","romania":"EU","san marino":"EU","serbia":"EU","slovakia":"EU","slovenia":"EU","spain":"EU","sweden":"EU","switzerland":"EU","ukraine":"EU","vatican city":"EU","us":"United States","u s":"United States","usa":"United States","u s a":"United States","united states of america":"United States","america":"United States",
    "uae":"United Arab Emirates","u a e":"United Arab Emirates","emirates":"United Arab Emirates",
    "south korea":"South Korea","republic of korea":"South Korea","korea south":"South Korea","kr":"South Korea",
    "north korea":"North Korea","korea north":"North Korea","kp":"North Korea",
    "viet nam":"Vietnam","turkey":"Türkiye","turkiye":"Türkiye","czech republic":"Czechia","holland":"Netherlands","the netherlands":"Netherlands",
    "mainland china":"China","pr china":"China","hong kong sar":"Hong Kong","macau":"Macao","russian federation":"Russia","burma":"Myanmar","swaziland":"Eswatini"
  };
  return aliases[key] || raw.toLocaleLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
};
const countBy = (rows: Record<string, unknown>[], field: string) => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = field === "country" ? normalizeCountry(row[field]) : clean(row[field]);
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
