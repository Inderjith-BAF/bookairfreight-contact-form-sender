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
    "australia": "Australia", "commonwealth of australia": "Australia", "eu": "EU", "europe": "EU", "netherlands": "EU",
    "the netherlands": "EU", "holland": "EU", "czechia": "EU", "czech republic": "EU", "hungary": "EU",
    "romania": "EU", "uk": "United Kingdom", "u k": "United Kingdom", "gb": "United Kingdom", "gbr": "United Kingdom",
    "great britain": "United Kingdom", "britain": "United Kingdom", "england": "United Kingdom", "scotland": "United Kingdom", "wales": "United Kingdom",
    "northern ireland": "United Kingdom", "united kingdom": "United Kingdom", "albania": "EU", "andorra": "EU", "austria": "EU",
    "belarus": "EU", "belgium": "EU", "bosnia and herzegovina": "EU", "bulgaria": "EU", "croatia": "EU",
    "cyprus": "EU", "denmark": "EU", "estonia": "EU", "finland": "EU", "france": "EU",
    "germany": "EU", "greece": "EU", "iceland": "EU", "ireland": "EU", "italy": "EU",
    "kosovo": "EU", "latvia": "EU", "liechtenstein": "EU", "lithuania": "EU", "luxembourg": "EU",
    "malta": "EU", "monaco": "EU", "montenegro": "EU", "north macedonia": "EU", "norway": "EU",
    "poland": "EU", "portugal": "EU", "san marino": "EU", "serbia": "EU", "slovakia": "EU",
    "slovenia": "EU", "spain": "EU", "sweden": "EU", "switzerland": "EU", "ukraine": "EU",
    "vatican city": "EU", "us": "United States", "u s": "United States", "usa": "United States", "u s a": "United States",
    "united states of america": "United States", "america": "United States", "uae": "United Arab Emirates", "u a e": "United Arab Emirates", "emirates": "United Arab Emirates",
    "south korea": "South Korea", "republic of korea": "South Korea", "korea south": "South Korea", "kr": "South Korea", "north korea": "North Korea",
    "korea north": "North Korea", "kp": "North Korea", "viet nam": "Vietnam", "turkey": "Türkiye", "turkiye": "Türkiye",
    "mainland china": "China", "pr china": "China", "hong kong sar": "Hong Kong", "macau": "Macao", "russian federation": "Russia",
    "burma": "Myanmar", "swaziland": "Eswatini"
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
  const { data, error } = await auth.admin.rpc("get_lead_inventory_report");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const report = (data || {}) as Record<string, any>;
  const countries = new Map<string, number>();
  for (const item of report.countries || []) {
    const key = normalizeCountry(item.key);
    countries.set(key, (countries.get(key) || 0) + Number(item.count || 0));
  }
  const sort = (items: any[]) => (items || []).map(item => ({ key: clean(item.key), count: Number(item.count || 0) })).sort((a,b) => b.count-a.count);
  return NextResponse.json({
    total: Number(report.total || 0),
    addedToday: Number(report.addedToday || 0),
    assigned: Number(report.assigned || 0),
    business: Number(report.business || 0),
    personal: Number(report.personal || 0),
    sources: sort(report.sources),
    rawSheets: sort(report.rawSheets),
    countries: [...countries.entries()].map(([key,count]) => ({key,count})).sort((a,b)=>b.count-a.count),
    industries: sort(report.industries),
    last7: (report.last7 || []).map((item: any) => ({ key: String(item.key), count: Number(item.count || 0) }))
  });
}
