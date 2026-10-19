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
  contact_form: ["Contact form"],
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
  // Page through the inventory instead of silently stopping at the API's default 1,000 rows.
  const pageSize = 1000;
  const data: any[] = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = admin.from("central_lead_inventory").select("*").order("created_at", { ascending: false }).order("id", { ascending: true }).range(offset, offset + pageSize - 1);
    if (source) query = query.ilike("data_source", "%" + source.replace(/[%_]/g, "") + "%");
    const { data: page, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    data.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }
  const leads = (data || []).filter((row: any) => !q || [
    row.location_on_site,row.country,row.company_name,row.first_name,row.last_name,row.title,row.email,
    row.main_product_description,row.secondary_product_description,row.main_industry,row.main_additional_tag,
    row.secondary_industry,row.secondary_additional_tag,row.qualified_lead,row.assigned_to,row.assigned_date,
    row.ecommerce_platform_used,row.data_from_lead_generation_team,row.data_source,row.email_finding_assigned_to,
    row.email_finding_assigned_date,row.business_personal_email,row.contact_form,row.fresh_outreach_assigned_to,row.fresh_outreach_assigned_date
  ].some(v => String(v || "").toLowerCase().includes(q)));
  return NextResponse.json({ leads, total: leads.length, team: members || [], currentRole: auth.profile.role });
}

export async function POST(request: Request) {
  const auth = await requireOutboundUser(request, ["admin", "lead_generation_admin"]);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const body = await request.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length || rows.length > 5000) return NextResponse.json({ error: "Upload between 1 and 5,000 new lead rows." }, { status: 400 });

  type RowResult = { row: number; email: string; result: string; reason: string };
  const results: RowResult[] = [];
  const candidates: { index: number; email: string; record: Record<string, unknown> }[] = [];
  const seenInRequest = new Set<string>();
  let duplicate = 0;
  let invalid = 0;

  // Validate and normalize first. Keep the original row index so the UI can
  // report exact spreadsheet rows even when invalid rows are skipped.
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] as Record<string, unknown>;
    const record: Record<string, unknown> = {};
    for (const [field, headers] of Object.entries(fields)) record[field] = pick(raw, ...headers);
    const email = clean(record.email).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      invalid++; results.push({ row: i + 1, email, result: "Skipped", reason: "Missing or invalid email" }); continue;
    }
    if (!clean(record.country)) {
      invalid++; results.push({ row: i + 1, email, result: "Skipped", reason: "Country is required" }); continue;
    }
    if (seenInRequest.has(email)) {
      duplicate++; results.push({ row: i + 1, email, result: "Skipped", reason: "Duplicate email in this upload" }); continue;
    }
    seenInRequest.add(email);
    record.email = email;
    record.imported_by = profile.id;
    candidates.push({ index: i, email, record });
  }

  // Insert a whole batch in one database request. The unique normalized_email
  // constraint is the final authority for duplicate safety; ignoreDuplicates
  // never updates an existing lead or its assignments/status.
  if (candidates.length) {
    const { data: insertedRows, error } = await admin
      .from("central_lead_inventory")
      .upsert(candidates.map(item => item.record), {
        onConflict: "normalized_email",
        ignoreDuplicates: true,
      })
      .select("normalized_email");

    if (!error) {
      const insertedEmails = new Set((insertedRows || []).map((row: { normalized_email: string }) => row.normalized_email));
      for (const item of candidates) {
        if (insertedEmails.has(item.email)) {
          results.push({ row: item.index + 1, email: item.email, result: "Added", reason: "New inventory lead" });
        } else {
          duplicate++;
          results.push({ row: item.index + 1, email: item.email, result: "Skipped", reason: "Email already exists in Central Lead Inventory" });
        }
      }
      const added = insertedEmails.size;
      results.sort((a, b) => a.row - b.row);
      return NextResponse.json({ added, duplicate, invalid, total: rows.length, results }, { status: 201 });
    }

    // Resilient fallback only if the bulk request fails (for example, a
    // schema/constraint issue). This preserves per-row error reporting.
    for (const item of candidates) {
      const { error: insertError } = await admin.from("central_lead_inventory").insert(item.record);
      if (!insertError) {
        results.push({ row: item.index + 1, email: item.email, result: "Added", reason: "New inventory lead" });
      } else if (insertError.code === "23505") {
        duplicate++;
        results.push({ row: item.index + 1, email: item.email, result: "Skipped", reason: "Email already exists in Central Lead Inventory" });
      } else {
        invalid++;
        results.push({ row: item.index + 1, email: item.email, result: "Skipped", reason: insertError.message });
      }
    }
  }

  results.sort((a, b) => a.row - b.row);
  const added = results.filter(item => item.result === "Added").length;
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
  const update: Record<string, unknown> = { [field]: value, updated_at: new Date().toISOString() };
  if (field === "fresh_outreach_assigned_to") {
    update.fresh_outreach_assigned_date = value ? new Date().toISOString().slice(0, 10) : null;
  }
  const { error } = await admin.from("central_lead_inventory").update(update).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: ids.length, field, value });
}