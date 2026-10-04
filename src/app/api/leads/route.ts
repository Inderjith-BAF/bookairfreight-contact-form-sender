import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED = ["admin", "lead_generation_admin"] as const;
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const value = (row: Record<string, unknown>, ...keys: string[]) => {
  const entries = new Map(Object.entries(row).map(([k,v]) => [norm(k), String(v ?? "").trim()]));
  for (const key of keys) { const v = entries.get(norm(key)); if (v) return v; }
  return "";
};
const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function GET(request: Request) {
  const auth = await requireOutboundUser(request, [...ALLOWED]);
  if ("error" in auth) return auth.error;
  const { admin } = auth;
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const country = searchParams.get("country") || "";
  const status = searchParams.get("status") || "";
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 50)));
  let query = admin.from("master_leads").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((page-1)*pageSize, page*pageSize-1);
  if (country) query = query.eq("country", country);
  if (status) query = query.eq("current_status", status);
  if (q) query = query.or("email.ilike.%"+q+"%,company_name.ilike.%"+q+"%,first_name.ilike.%"+q+"%,last_name.ilike.%"+q+"%,country.ilike.%"+q+"%");
  const [{ data, error, count }, { data: batches, error: batchError }] = await Promise.all([
    query,
    admin.from("lead_import_batches").select("*").order("started_at", { ascending: false }).limit(20)
  ]);
  if (error || batchError) return NextResponse.json({ error: error?.message || batchError?.message }, { status: 500 });
  return NextResponse.json({ leads: data || [], total: count || 0, page, pageSize, batches: batches || [] });
}

export async function POST(request: Request) {
  const auth = await requireOutboundUser(request, [...ALLOWED]);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const body = await request.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length || rows.length > 5000) return NextResponse.json({ error: "Paste between 1 and 5,000 rows." }, { status: 400 });

  const { data: batch, error: batchError } = await admin.from("lead_import_batches").insert({
    file_name: String(body?.fileName || "Pasted data").slice(0, 250),
    imported_by: profile.id, total_rows: rows.length
  }).select("id").single();
  if (batchError || !batch) return NextResponse.json({ error: batchError?.message || "Could not create import batch." }, { status: 500 });

  const seen = new Set<string>();
  const results: Array<Record<string, unknown>> = [];
  let added = 0, existing = 0, inBatch = 0, invalid = 0, missingCountry = 0;
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] as Record<string, unknown>;
    const email = value(raw, "Email", "Recipient Email").trim();
    const normalized = email.toLowerCase();
    const company = value(raw, "Company Name", "Company");
    let reason = "";
    if (!emailOk(email)) { invalid++; reason = "Invalid or missing email address"; }
    else if (!value(raw, "Country")) { missingCountry++; reason = "Country is required"; }
    else if (seen.has(normalized)) { inBatch++; reason = "Duplicate email within this import"; }
    else {
      seen.add(normalized);
      const record = {
        email, location_on_site: value(raw, "Location On Site", "Website"),
        country: value(raw, "Country"), company_name: company,
        first_name: value(raw, "First Name"), last_name: value(raw, "Last Name"), title: value(raw, "Title"),
        main_product_description: value(raw, "Main Product Description"),
        secondary_product_description: value(raw, "Secondary Production Description (check)", "Secondary Product Description"),
        main_industry: value(raw, "Main Industry"), main_additional_tag: value(raw, "Main Additional Tag"),
        secondary_industry: value(raw, "Seondary Industry", "Secondary Industry"),
        secondary_additional_tag: value(raw, "Seondary Additional Tag", "Secondary Additional Tag"),
        qualified_lead: value(raw, "Qualified lead?", "Qualified Lead"),
        assigned_to: value(raw, "Assigned To"), assigned_date: value(raw, "Assigned Date"),
        ecommerce_platform_used: value(raw, "Ecommerce platform used"),
        data_from_lead_generation_team: value(raw, "Data from lead generation team"),
        data_source: value(raw, "Data source (need to indicate which raw data sheet you are using)", "Data source"),
        email_finding_assigned_to: value(raw, "(Email Finding) Assigned To", "Email Finding Assigned To"),
        email_finding_assigned_date: value(raw, "(Email Finding) Assigned Date", "Email Finding Assigned Date"),
        business_personal_email: value(raw, "Business / Personal Email"),
        fresh_outreach_assigned_to: value(raw, "Assigned to (Fresh Outreach)", "Assigned to Fresh Outreach"),
        fresh_outreach_assigned_date: value(raw, "Assigned Date (Fresh Outreach)"),
        lead_owner: profile.id
      };
      const { data: lead, error } = await admin.from("master_leads").insert(record).select("id").single();
      if (!error && lead) {
        added++;
        await admin.from("lead_activity_events").insert({ lead_id: lead.id, actor_id: profile.id, event_type: "lead_imported", details: { batch_id: batch.id, row_number: i+1, source: body?.fileName || "Pasted data" } });
        reason = "Added";
        results.push({ row_number: i+1, email, company_name: company, result: "added", reason });
        continue;
      }
      if (error?.code === "23505") { existing++; reason = "Email already exists in Master Lead Sheet"; }
      else { invalid++; reason = error?.message || "Could not save row"; }
    }
    results.push({ row_number: i+1, email, company_name: company, result: "skipped", reason });
  }
  const completedAt = new Date().toISOString();
  const counts = { total_rows: rows.length, added_count: added, skipped_existing: existing, skipped_in_batch: inBatch, skipped_invalid: invalid, skipped_missing_country: missingCountry, completed_at: completedAt };
  const { error: updateError } = await admin.from("lead_import_batches").update(counts).eq("id", batch.id);
  const { error: resultError } = await admin.from("lead_import_results").insert(results.map(r => ({ ...r, batch_id: batch.id })));
  if (updateError || resultError) return NextResponse.json({ error: updateError?.message || resultError?.message, batchId: batch.id, partial: true }, { status: 500 });
  return NextResponse.json({ batchId: batch.id, ...counts, results }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireOutboundUser(request, [...ALLOWED]);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const body = await request.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "Lead ID is required." }, { status: 400 });
  const allowed = ["Positive","Neutral","Negative","New","Qualified","Fresh Outreach","Follow-up 1","Follow-up 2","Follow-up 3","Needs Review","Suppressed"];
  const classification = body?.responseClassification;
  const status = String(body?.status || classification || "");
  if (!allowed.includes(status)) return NextResponse.json({ error: "Unsupported lead status." }, { status: 400 });
  const { data: before, error: readError } = await admin.from("master_leads").select("*").eq("id", id).maybeSingle();
  if (readError || !before) return NextResponse.json({ error: readError?.message || "Lead not found." }, { status: 404 });
  const isResponse = ["Positive","Neutral","Negative"].includes(status);
  const patch: Record<string, unknown> = {
    current_status: status,
    response_classification: isResponse ? status : null,
    updated_at: new Date().toISOString()
  };
  if (isResponse) { patch.suppression_reason = "Response classified: " + status; patch.suppressed_at = new Date().toISOString(); }
  if (status === "Suppressed") { patch.suppression_reason = String(body?.suppressionReason || "Manually suppressed"); patch.suppressed_at = new Date().toISOString(); }
  if (["New","Qualified","Fresh Outreach","Follow-up 1","Follow-up 2","Follow-up 3"].includes(status) && before.suppression_reason) {
    return NextResponse.json({ error: "This lead is suppressed. Reactivation requires an explicit admin workflow and must not be done by changing status." }, { status: 409 });
  }
  const { data: updated, error } = await admin.from("master_leads").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("lead_activity_events").insert({
    lead_id: id, actor_id: profile.id, event_type: isResponse ? "response_classified" : "status_changed",
    previous_value: before.current_status, new_value: status,
    details: { previous_response: before.response_classification, suppression_reason: patch.suppression_reason || null }
  });
  return NextResponse.json({ lead: updated });
}
