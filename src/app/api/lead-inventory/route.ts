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
  const q = clean(url.searchParams.get("q")).slice(0, 160);
  const source = clean(url.searchParams.get("source")).slice(0, 120);
  const pageRaw = Number(url.searchParams.get("page") || "1");
  const sizeRaw = Number(url.searchParams.get("pageSize") || "600");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
  const pageSize = Number.isFinite(sizeRaw) ? Math.min(600, Math.max(25, Math.floor(sizeRaw))) : 600;

  const { data: members, error: teamError } = await admin
    .from("outbound_profiles").select("id,full_name,role,active").eq("active", true).order("full_name");
  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 });

  // Never download the full inventory into the browser. Each request returns
  // at most one page, so memory use stays bounded as the table grows to 1M+ rows.
  let query = admin.from("central_lead_inventory")
    .select("id,created_at,location_on_site,country,company_name,first_name,last_name,title,email,main_product_description,secondary_product_description,main_industry,main_additional_tag,secondary_industry,secondary_additional_tag,qualified_lead,assigned_to,assigned_date,ecommerce_platform_used,data_from_lead_generation_team,data_source,email_finding_assigned_to,email_finding_assigned_date,business_personal_email,contact_form,fresh_outreach_assigned_to,fresh_outreach_assigned_date", { count: "exact" })
    .order("created_at", { ascending: false }).order("id", { ascending: false });
  if (source) query = query.ilike("data_source", "%" + source.replace(/[%_]/g, "") + "%");
  if (q) {
    const escaped = q.replace(/[(),.]/g, " ").replace(/[%_]/g, "");
    const pattern = "%" + escaped + "%";
    query = query.or([
      "location_on_site","country","company_name","first_name","last_name","title","email",
      "main_product_description","secondary_product_description","main_industry","main_additional_tag",
      "secondary_industry","secondary_additional_tag","qualified_lead","assigned_to","ecommerce_platform_used",
      "data_from_lead_generation_team","data_source","email_finding_assigned_to","business_personal_email",
      "contact_form","fresh_outreach_assigned_to"
    ].map(field => field + ".ilike." + pattern).join(","));
  }
  const from = (page - 1) * pageSize;
  const { data: leads, count, error } = await query.range(from, from + pageSize - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    leads: leads || [],
    total: count || 0,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil((count || 0) / pageSize)),
    team: members || [],
    currentRole: auth.profile.role
  });
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
  if (body?.action === "assign_filtered") {
    const requested = Number(body?.limit);
    const limit = Number.isFinite(requested) ? Math.min(5000, Math.max(1, Math.floor(requested))) : 0;
    const assignee = clean(body?.assignee);
    const source = clean(body?.source).slice(0, 120);
    const q = clean(body?.q).slice(0, 160);
    const countries = Array.isArray(body?.countries) ? body.countries.map(clean).filter(Boolean).slice(0, 100) : [];
    if (!limit || !assignee) return NextResponse.json({ error: "Choose an assignee and a valid quantity between 1 and 5,000." }, { status: 400 });
    const { data: person, error: personError } = await admin.from("outbound_profiles").select("id,full_name,active").eq("full_name", assignee).eq("active", true).maybeSingle();
    if (personError || !person) return NextResponse.json({ error: "Select an active team member." }, { status: 400 });
    let query = admin.from("central_lead_inventory").select("id").is("fresh_outreach_assigned_to", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
    if (source) query = query.ilike("data_source", "%" + source.replace(/[%_]/g, "") + "%");
    if (countries.length === 1) query = query.eq("country", countries[0]);
    else if (countries.length > 1) query = query.in("country", countries);
    if (q) {
      const escaped = q.replace(/[(),.]/g, " ").replace(/[%_]/g, "");
      const pattern = "%" + escaped + "%";
      query = query.or([
        "location_on_site","country","company_name","first_name","last_name","title","email",
        "main_product_description","secondary_product_description","main_industry","main_additional_tag",
        "secondary_industry","secondary_additional_tag","qualified_lead","assigned_to","ecommerce_platform_used",
        "data_from_lead_generation_team","data_source","email_finding_assigned_to","business_personal_email",
        "contact_form","fresh_outreach_assigned_to"
      ].map(field => field + ".ilike." + pattern).join(","));
    }
    const { data: candidates, error: findError } = await query;
    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
    const idsToAssign = (candidates || []).map((row: {id:string}) => row.id);
    if (!idsToAssign.length) return NextResponse.json({ updated: 0, requested: limit, assignee, message: "No unassigned leads matched those filters." });
    const { data: updatedRows, error: updateError } = await admin.from("central_lead_inventory")
      .update({ fresh_outreach_assigned_to: assignee, fresh_outreach_assigned_date: new Date().toISOString().slice(0,10), updated_at: new Date().toISOString() })
      .in("id", idsToAssign).select("id");
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ updated: updatedRows?.length || 0, requested: limit, assignee });
  }
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