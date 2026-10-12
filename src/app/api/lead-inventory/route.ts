import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (v: unknown) => String(v ?? "").trim();
const norm = (v: unknown) => clean(v).toLowerCase().replace(/[^a-z0-9]/g, "");
const pick = (row: Record<string, unknown>, ...names: string[]) => {
  const values = new Map(Object.entries(row).map(([k,v]) => [norm(k), clean(v)]));
  for (const name of names) { const value = values.get(norm(name)); if (value) return value; }
  return "";
};
const fields = {
  location_on_site: ["Location On Site"],
  country: ["Country"],
  company_name: ["Company Name"],
  first_name: ["First Name"],
  last_name: ["Last Name"],
  title: ["Title"],
  email: ["Email"],
  main_product_description: ["Main Product Description"],
  secondary_product_description: ["Secondary Production Description (check)"],
  main_industry: ["Main Industry"],
  main_additional_tag: ["Main Additional Tag"],
  secondary_industry: ["Seondary Industry"],
  secondary_additional_tag: ["Seondary Additional Tag"],
  qualified_lead: ["Qualified lead?"],
  assigned_to: ["Assigned To"],
  assigned_date: ["Assigned Date"],
  ecommerce_platform_used: ["Ecommerce platform used"],
  data_from_lead_generation_team: ["Data from lead generation team"],
  data_source: ["Data source (need to indicate which raw data sheet you are using)", "Data source"],
  email_finding_assigned_to: ["(Email Finding)     Assigned To", "(Email Finding) Assigned To"],
  email_finding_assigned_date: ["(Email Finding)     Assigned Date", "(Email Finding) Assigned Date"],
  business_personal_email: ["Business / Personal Email"],
  fresh_outreach_assigned_to: ["Assigned to(Fresh Outreach)", "Assigned to (Fresh Outreach)"],
  fresh_outreach_assigned_date: ["Assigned Date(Fresh Outreach)", "Assigned Date (Fresh Outreach)"]
} as const;

export async function GET(request: Request) {
  const auth = await requireOutboundUser(request);
  if ("error" in auth) return auth.error;
  const { admin } = auth;
  const url = new URL(request.url);
  const q = clean(url.searchParams.get("q")).toLowerCase();
  const source = clean(url.searchParams.get("source"));
  const { data: members, error: teamError } = await admin.from("outbound_profiles").select("id,full_name,role,active").eq("active", true).order("full_name");
  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 });
  let query = admin.from("central_lead_inventory").select("*").order("created_at", { ascending: false }).limit(10000);
  if (source) query = query.ilike("data_source", "%" + source.replace(/[%_]/g, "") + "%");
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const leads = (data || []).filter((row: any) => !q || [
    row.location_on_site,row.country,row.company_name,row.first_name,row.last_name,row.title,row.email,
    row.main_product_description,row.secondary_product_description,row.main_industry,row.main_additional_tag,
    row.secondary_industry,row.secondary_additional_tag,row.qualified_lead,row.assigned_to,row.assigned_date,
    row.ecommerce_platform_used,row.data_from_lead_generation_team,row.data_source,row.email_finding_assigned_to,
    row.email_finding_assigned_date,row.business_personal_email,row.fresh_outreach_assigned_to,row.fresh_outreach_assigned_date
  ].some(v => String(v || "").toLowerCase().includes(q)));
  return NextResponse.json({ leads, total: leads.length, team: members || [], currentRole: auth.profile.role });
}

export async function POST(request: Request) {
  const auth = await requireOutboundUser(request, ["admin", "lead_generation_admin", "member"]);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const body = await request.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length || rows.length > 5000) return NextResponse.json({ error: "Upload between 1 and 5,000 new lead rows." }, { status: 400 });
  let added = 0, duplicate = 0, invalid = 0;
  const results: { row: number; email: string; result: string; reason: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] as Record<string, unknown>;
    const record: Record<string, unknown> = {};
    for (const [field, headers] of Object.entries(fields)) record[field] = pick(raw, ...headers);
    const email = clean(record.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      invalid++; results.push({ row: i + 1, email, result: "Skipped", reason: "Missing or invalid email" }); continue;
    }
    if (!clean(record.country)) {
      invalid++; results.push({ row: i + 1, email, result: "Skipped", reason: "Country is required" }); continue;
    }
    record.email = email;
    record.imported_by = profile.id;
    const { error } = await admin.from("central_lead_inventory").insert(record);
    if (error?.code === "23505") {
      duplicate++; results.push({ row: i + 1, email, result: "Skipped", reason: "Email already exists in Central Lead Inventory" });
    } else if (error) {
      invalid++; results.push({ row: i + 1, email, result: "Skipped", reason: error.message });
    } else {
      added++; results.push({ row: i + 1, email, result: "Added", reason: "New inventory lead" });
    }
  }
  return NextResponse.json({ added, duplicate, invalid, total: rows.length, results }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireOutboundUser(request, ["admin", "lead_generation_admin", "member"]);
  if ("error" in auth) return auth.error;
  const { admin } = auth;
  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];
  const field = String(body?.field || "");
  const value = clean(body?.value);
  if (!ids.length || ids.length > 500 || !["fresh_outreach_assigned_to", "fresh_outreach_assigned_date"].includes(field)) {
    return NextResponse.json({ error: "Choose rows and a supported Fresh Outreach assignment field." }, { status: 400 });
  }
  if (field === "fresh_outreach_assigned_to" && value) {
    const { data: person, error } = await admin.from("outbound_profiles").select("id,full_name,active").eq("full_name", value).eq("active", true).maybeSingle();
    if (error || !person) return NextResponse.json({ error: "Select an active team member from the dropdown." }, { status: 400 });
  }
  if (field === "fresh_outreach_assigned_date" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
  }
  const { error } = await admin.from("central_lead_inventory").update({ [field]: value, updated_at: new Date().toISOString() }).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: ids.length, field, value });
}