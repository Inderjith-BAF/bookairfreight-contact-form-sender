import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const WRITE_ROLES = ["admin", "lead_generation_admin", "member"] as const;
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const value = (row: Record<string, unknown>, ...keys: string[]) => {
  const entries = new Map(Object.entries(row).map(([k,v]) => [norm(k), String(v ?? "").trim()]));
  for (const key of keys) { const v = entries.get(norm(key)); if (v) return v; }
  return "";
};
const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function GET(request: Request) {
  const auth = await requireOutboundUser(request);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const country = searchParams.get("country") || "";
  const status = searchParams.get("status") || "";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";
  const company = searchParams.get("company") || "";
  const website = searchParams.get("website") || "";
  const contact = searchParams.get("contact") || "";
  const industry = searchParams.get("industry") || "";
  const emailType = searchParams.get("emailType") || "";
  const leadSourceFilter = searchParams.get("leadSourceFilter") || "";
  const ecommerce = searchParams.get("ecommerce") || "";
  const leadOwner = searchParams.get("leadOwner") || "";
  const validation = searchParams.get("validation") || "";
  const emailFinding = searchParams.get("emailFinding") || "";
  const suppression = searchParams.get("suppression") || "";
  const updatedDate = searchParams.get("updatedDate") || "";
  const lastContactDate = searchParams.get("lastContactDate") || "";
  const lastReplyDate = searchParams.get("lastReplyDate") || "";
  const exportCsv = searchParams.get("export") === "csv";
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(1000, Math.max(10, Number(searchParams.get("pageSize") || 50)));
  const { data: team, error: teamError } = await admin.from("outbound_profiles").select("id,full_name,role,active").eq("active", true).order("full_name");
  const isFullLeadAccess = profile.role === "admin" || profile.role === "lead_generation_admin";
  const memberLeadOwner = isFullLeadAccess ? "" : profile.id;
  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 });
  let query = admin.from("master_leads").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (!exportCsv && !leadOwner) query = query.range((page-1)*pageSize, page*pageSize-1);
  if (country) {
    const aliases: Record<string,string[]> = {
      usa: ["USA","US","United States","United States of America"],
      uk: ["UK","GB","United Kingdom","Great Britain"],
      uae: ["UAE","United Arab Emirates"],
      australia: ["Australia","AU"],
      canada: ["Canada","CA"],
      india: ["India","IN"]
    };
    const values = aliases[country.trim().toLowerCase()] || [country];
    query = values.length === 1 ? query.ilike("country", values[0]) : query.or(values.map(v => "country.ilike."+v.replace(/[,()]/g, "")).join(","));
  }
  if (status) query = query.eq("current_status", status);
  // Employees only see leads they own. Admin and Lead Generation Admin retain the complete registry.
  if (memberLeadOwner) query = query.eq("lead_owner", memberLeadOwner);
  if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);
  if (q) query = query.or("email.ilike.%"+q+"%,company_name.ilike.%"+q+"%,location_on_site.ilike.%"+q+"%,first_name.ilike.%"+q+"%,last_name.ilike.%"+q+"%,country.ilike.%"+q+"%,title.ilike.%"+q+"%,main_industry.ilike.%"+q+"%,ecommerce_platform_used.ilike.%"+q+"%,assigned_to.ilike.%"+q+"%,email_finding_assigned_to.ilike.%"+q+"%,fresh_outreach_assigned_to.ilike.%"+q+"%,current_status.ilike.%"+q+"%,suppression_reason.ilike.%"+q+"%");
  if (company) query = query.or("company_name.ilike.%"+company+"%,email.ilike.%"+company+"%");
  if (website) query = query.ilike("location_on_site", "%"+website+"%");
  if (contact) query = query.or("first_name.ilike.%"+contact+"%,last_name.ilike.%"+contact+"%,title.ilike.%"+contact+"%");
  if (industry) query = query.ilike("main_industry", "%"+industry+"%");
  if (emailType) query = query.ilike("business_personal_email", "%"+emailType+"%");
  if (leadSourceFilter) query = query.ilike("data_source", "%"+leadSourceFilter+"%");
  if (ecommerce) query = query.ilike("ecommerce_platform_used", "%"+ecommerce+"%");
  if (validation) query = query.ilike("assigned_to", "%"+validation+"%");
  if (emailFinding) query = query.ilike("email_finding_assigned_to", "%"+emailFinding+"%");
  if (suppression) query = query.ilike("suppression_reason", "%"+suppression+"%");
  const dayBounds = (date:string) => ({from:`${date}T00:00:00.000Z`,to:`${date}T23:59:59.999Z`});
  if (updatedDate) { const d=dayBounds(updatedDate); query=query.gte("updated_at",d.from).lte("updated_at",d.to); }
  if (lastContactDate) { const d=dayBounds(lastContactDate); query=query.gte("last_contacted_at",d.from).lte("last_contacted_at",d.to); }
  if (lastReplyDate) { const d=dayBounds(lastReplyDate); query=query.gte("last_replied_at",d.from).lte("last_replied_at",d.to); }
  const [{ data, error, count }, { data: batches, error: batchError }] = await Promise.all([
    query,
    admin.from("lead_import_batches").select("*").order("started_at", { ascending: false }).limit(20)
  ]);
  if (error || batchError) return NextResponse.json({ error: error?.message || batchError?.message }, { status: 500 });
  const ownerIds = [...new Set((data || []).map((lead: any) => lead.lead_owner).filter(Boolean))];
  const { data: owners } = ownerIds.length ? await admin.from("outbound_profiles").select("id,full_name").in("id", ownerIds) : { data: [] as any[] };
  const ownerNames = new Map((owners || []).map((owner: any) => [owner.id, owner.full_name]));
  // Resolve the latest outreach mailbox used for each visible lead.
  const visibleLeadIds = [...new Set((data || []).map((lead:any) => String(lead.id)))];
  const outreachByLead = new Map<string,string>();
  if (visibleLeadIds.length) {
    const { data: outreachRows, error: outreachError } = await admin.from("mail_merge_campaign_recipients")
      .select("lead_id,sender_account_id,created_at")
      .in("lead_id", visibleLeadIds)
      .in("status", ["Sent","Replied","Bounced"])
      .order("created_at", { ascending: false });
    if (outreachError) return NextResponse.json({ error: outreachError.message }, { status: 500 });
    const accountIds = [...new Set((outreachRows || []).map((row:any) => row.sender_account_id).filter(Boolean))];
    const { data: outreachAccounts } = accountIds.length
      ? await admin.from("outbound_email_accounts").select("id,email").in("id", accountIds)
      : { data: [] as any[] };
    const emailByAccount = new Map((outreachAccounts || []).map((account:any) => [String(account.id), String(account.email || "")]));
    for (const row of outreachRows || []) {
      const id = String(row.lead_id);
      if (!outreachByLead.has(id)) outreachByLead.set(id, emailByAccount.get(String(row.sender_account_id)) || "");
    }
  }

  // Resolve the Fresh Outreach owner from the actual imported field first, then
  // expose its profile ID. This makes filtering independent of database text
  // matching quirks and handles legacy first-name-only spreadsheet values.
  const normalized = (value: unknown) => String(value || "").trim().toLowerCase().replace(/\\s+/g, " ");
  const visibleTeam = isFullLeadAccess ? (team || []) : (team || []).filter((member:any) => member.id === profile.id);
  const teamById = new Map(visibleTeam.map((member:any) => [member.id, member]));
  const freshOwnerId = (value: unknown) => {
    const target = normalized(value);
    if (!target) return null;
    const exact = visibleTeam.find((member:any) => normalized(member.full_name) === target);
    if (exact) return exact.id;
    const first = visibleTeam.filter((member:any) => normalized(member.full_name).split(" ")[0] === target);
    return first.length === 1 ? first[0].id : null;
  };

  let leads = (data || []).map((lead: any) => ({
    ...lead,
    lead_owner_name: ownerNames.get(lead.lead_owner) || "Unassigned",
    outreach_account_email: outreachByLead.get(String(lead.id)) || "",
    uploader_name: ownerNames.get(lead.lead_owner) || "Unassigned",
    fresh_outreach_owner_id: freshOwnerId(lead.fresh_outreach_assigned_to)
  }));

  // Lead Owner is explicitly the Fresh Outreach Owner in this registry.
  // When selected, filter the fully resolved dataset before pagination.
  if (leadOwner) {
    leads = leads.filter((lead:any) => lead.fresh_outreach_owner_id === leadOwner);
  }

  const filteredTotal = leads.length;

  if (exportCsv) {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = ["Company Name","Website","Email","Country","Business / Personal Email","Lead Source","First Name","Last Name","Title","Main Industry","Ecommerce Platform","Lead Owner (Fresh Outreach)","Email Finding Owner","Outreach Account","Uploaded By","Status / Response","Suppression","Added","Updated","Last Contact","Last Reply"];
    const rows = leads.map((lead: any) => [lead.company_name,lead.location_on_site,lead.email,lead.country,lead.business_personal_email,lead.data_source,lead.first_name,lead.last_name,lead.title,lead.main_industry,lead.ecommerce_platform_used,lead.fresh_outreach_assigned_to,lead.email_finding_assigned_to,lead.outreach_account_email,lead.uploader_name,lead.current_status,lead.suppression_reason,lead.created_at,lead.updated_at,lead.last_contacted_at,lead.last_replied_at].map(esc).join(","));
    return new NextResponse([headers.map(esc).join(","), ...rows].join("\n"), { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="master-lead-registry-${new Date().toISOString().slice(0,10)}.csv"` } });
  }

  if (leadOwner) {
    const startIndex = (page - 1) * pageSize;
    leads = leads.slice(startIndex, startIndex + pageSize);
  }

  return NextResponse.json({ leads, total: leadOwner ? filteredTotal : count || 0, page, pageSize, batches: isFullLeadAccess ? (batches || []) : [], team: visibleTeam });
}

export async function POST(request: Request) {
  const auth = await requireOutboundUser(request, [...WRITE_ROLES]);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const body = await request.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  const leadSource = String(body?.leadSource || "").trim();
  if (!leadSource) return NextResponse.json({ error: "Enter the internal sheet name or lead source before importing." }, { status: 400 });
  if (!rows.length || rows.length > 5000) return NextResponse.json({ error: "Paste between 1 and 5,000 rows." }, { status: 400 });

  const { data: batch, error: batchError } = await admin.from("lead_import_batches").insert({
    file_name: String(body?.fileName || "Pasted data").slice(0, 250),
    imported_by: profile.id, total_rows: rows.length
  }).select("id").single();
  if (batchError || !batch) return NextResponse.json({ error: batchError?.message || "Could not create import batch." }, { status: 500 });

  type ImportResult = { row_number: number; email: string; company_name: string; result: "added" | "skipped"; reason: string };
  const seen = new Set<string>();
  const results: ImportResult[] = [];
  const candidates: Array<{ row_number: number; email: string; company_name: string; record: Record<string, unknown> }> = [];
  let existing = 0, inBatch = 0, invalid = 0, missingCountry = 0, added = 0;
  const sourceName = String(body?.fileName || "Pasted data");

  // Validate the full sheet before writing. Normalize emails consistently so
  // case/whitespace variations in one upload cannot create duplicate attempts.
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
      const record: Record<string, unknown> = {
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
        data_source: leadSource || value(raw, "Data source (need to indicate which raw data sheet you are using)", "Data source") || "Unspecified",
        email_finding_assigned_to: value(raw, "(Email Finding) Assigned To", "Email Finding Assigned To"),
        email_finding_assigned_date: value(raw, "(Email Finding) Assigned Date", "Email Finding Assigned Date"),
        business_personal_email: value(raw, "Business / Personal Email", "Email Type"),
        fresh_outreach_assigned_to: value(raw, "Assigned to (Fresh Outreach)", "Assigned to Fresh Outreach"),
        fresh_outreach_assigned_date: value(raw, "Assigned Date (Fresh Outreach)"),
        current_status: "New",
        lead_owner: profile.id
      };
      candidates.push({ row_number: i + 1, email, company_name: company, record });
      continue;
    }
    results.push({ row_number: i + 1, email, company_name: company, result: "skipped", reason });
  }

  const addedLeads: Array<Record<string, unknown>> = [];
  const resolvedLeads: Array<Record<string, unknown>> = [];
  const chunkSize = 400;

  // Insert batches rather than making a separate database round-trip per lead.
  // The unique normalized_email constraint is authoritative; conflicts are
  // ignored, never updated, so existing lead ownership/status is preserved.
  for (let offset = 0; offset < candidates.length; offset += chunkSize) {
    const chunk = candidates.slice(offset, offset + chunkSize);
    const { data: inserted, error: insertError } = await admin
      .from("master_leads")
      .upsert(chunk.map(item => item.record), { onConflict: "normalized_email", ignoreDuplicates: true })
      .select("*");

    if (!insertError) {
      const insertedByEmail = new Map((inserted || []).map((lead: Record<string, any>) => [String(lead.normalized_email || String(lead.email || "").trim().toLowerCase()), lead]));
      const insertedIds: string[] = [];
      for (const item of chunk) {
        const lead = insertedByEmail.get(item.email.toLowerCase());
        if (lead) {
          added++;
          addedLeads.push(lead);
          resolvedLeads.push(lead);
          insertedIds.push(String(lead.id));
          results.push({ row_number: item.row_number, email: item.email, company_name: item.company_name, result: "added", reason: "Added" });
        } else {
          existing++;
          results.push({ row_number: item.row_number, email: item.email, company_name: item.company_name, result: "skipped", reason: "Email already exists in Master Lead Sheet" });
        }
      }
      if (insertedIds.length) {
        const events = (inserted || []).map((lead: Record<string, any>) => {
          const item = chunk.find(candidate => candidate.email.toLowerCase() === String(lead.normalized_email || String(lead.email || "").trim().toLowerCase()));
          return item ? { lead_id: lead.id, actor_id: profile.id, event_type: "lead_imported", details: { batch_id: batch.id, row_number: item.row_number, source: sourceName } } : null;
        }).filter((event): event is NonNullable<typeof event> => event !== null);
        if (events.length) {
          const { error: activityError } = await admin.from("lead_activity_events").insert(events);
          if (activityError) console.error("Master Lead Sheet import activity logging failed", { batchId: batch.id, message: activityError.message });
        }
      }
      continue;
    }

    // If bulk insert fails, retain the previous safe per-row path so one
    // problematic row does not discard the entire chunk.
    for (const item of chunk) {
      const { data: lead, error } = await admin.from("master_leads").insert(item.record).select("*").single();
      if (!error && lead) {
        added++;
        addedLeads.push(lead);
        resolvedLeads.push(lead);
        results.push({ row_number: item.row_number, email: item.email, company_name: item.company_name, result: "added", reason: "Added" });
        const { error: activityError } = await admin.from("lead_activity_events").insert({ lead_id: lead.id, actor_id: profile.id, event_type: "lead_imported", details: { batch_id: batch.id, row_number: item.row_number, source: sourceName } });
        if (activityError) console.error("Master Lead Sheet import activity logging failed", { batchId: batch.id, rowNumber: item.row_number, message: activityError.message });
      } else if (error?.code === "23505") {
        existing++;
        results.push({ row_number: item.row_number, email: item.email, company_name: item.company_name, result: "skipped", reason: "Email already exists in Master Lead Sheet" });
        const { data: existingLead } = await admin.from("master_leads").select("*").eq("normalized_email", item.email.toLowerCase()).maybeSingle();
        if (existingLead) resolvedLeads.push(existingLead);
      } else {
        invalid++;
        results.push({ row_number: item.row_number, email: item.email, company_name: item.company_name, result: "skipped", reason: error?.message || "Could not save row" });
      }
    }
  }

  // Resolve duplicate rows in bounded queries for the response without changing
  // any existing record. This is only for callers that display resolved leads.
  const duplicateEmails = results.filter(item => item.reason === "Email already exists in Master Lead Sheet").map(item => item.email.toLowerCase());
  for (let offset = 0; offset < duplicateEmails.length; offset += chunkSize) {
    const emails = duplicateEmails.slice(offset, offset + chunkSize);
    if (!emails.length) continue;
    const { data: found } = await admin.from("master_leads").select("*").in("normalized_email", emails);
    if (found) resolvedLeads.push(...found);
  }

  results.sort((a, b) => a.row_number - b.row_number);
  const completedAt = new Date().toISOString();
  const counts = { total_rows: rows.length, added_count: added, skipped_existing: existing, skipped_in_batch: inBatch, skipped_invalid: invalid, skipped_missing_country: missingCountry, completed_at: completedAt };
  const { error: updateError } = await admin.from("lead_import_batches").update(counts).eq("id", batch.id);
  let resultError: { message: string } | null = null;
  for (let offset = 0; offset < results.length; offset += 1000) {
    const { error } = await admin.from("lead_import_results").insert(results.slice(offset, offset + 1000).map(item => ({ ...item, batch_id: batch.id })));
    if (error) { resultError = error; break; }
  }
  if (updateError || resultError) return NextResponse.json({ error: updateError?.message || resultError?.message, batchId: batch.id, partial: true }, { status: 500 });
  return NextResponse.json({ batchId: batch.id, ...counts, results, added_leads: addedLeads, resolved_leads: resolvedLeads }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireOutboundUser(request, [...WRITE_ROLES]);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const body = await request.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "Lead ID is required." }, { status: 400 });
  const allowed = ["Positive","Neutral","Negative","New","Qualified","Fresh Outreach","Follow-up 1","Follow-up 2","Follow-up 3","Out of Office","Bounced","Unsubscribed","Needs Review","Suppressed"];
  const classification = body?.responseClassification;
  const status = String(body?.status || classification || "");
  if (!allowed.includes(status)) return NextResponse.json({ error: "Unsupported lead status." }, { status: 400 });
  const { data: before, error: readError } = await admin.from("master_leads").select("*").eq("id", id).maybeSingle();
  if (readError || !before) return NextResponse.json({ error: readError?.message || "Lead not found." }, { status: 404 });
  if (profile.role === "member" && before.lead_owner !== profile.id) return NextResponse.json({ error: "Members can update only leads they uploaded." }, { status: 403 });
  const isResponse = ["Positive","Neutral","Negative"].includes(status);
  const patch: Record<string, unknown> = {
    current_status: status,
    response_classification: isResponse ? status : null,
    updated_at: new Date().toISOString()
  };
  if (isResponse) { patch.suppression_reason = "Response classified: " + status; patch.suppressed_at = new Date().toISOString(); patch.last_replied_at = new Date().toISOString(); }
  if (status === "Suppressed") { patch.suppression_reason = String(body?.suppressionReason || "Manually suppressed"); patch.suppressed_at = new Date().toISOString(); }
  if (status === "Bounced" || status === "Unsubscribed") { patch.suppression_reason = status; patch.suppressed_at = new Date().toISOString(); }
  if (status === "Out of Office") patch.last_replied_at = new Date().toISOString();
  if (["New","Qualified","Fresh Outreach","Follow-up 1","Follow-up 2","Follow-up 3"].includes(status) && before.suppression_reason) {
    return NextResponse.json({ error: "This lead is suppressed. Reactivation requires an explicit admin workflow and must not be done by changing status." }, { status: 409 });
  }
  const { data: updated, error } = await admin.from("master_leads").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (isResponse) {
    // Attribute classification to the most recent campaign that received a human reply.
    const { data: repliedRecipients, error: repliedError } = await admin
      .from("mail_merge_campaign_recipients")
      .select("id,campaign_id,sent_at")
      .eq("lead_id", id)
      .eq("status", "Replied")
      .order("sent_at", { ascending: false })
      .limit(1);
    if (repliedError) return NextResponse.json({ error: repliedError.message }, { status: 500 });
    if (repliedRecipients?.length) {
      const { error: classificationError } = await admin
        .from("mail_merge_campaign_recipients")
        .update({ response_classification: status })
        .eq("id", repliedRecipients[0].id);
      if (classificationError) return NextResponse.json({ error: classificationError.message }, { status: 500 });
    }
  }

  await admin.from("lead_activity_events").insert({
    lead_id: id, actor_id: profile.id, event_type: isResponse ? "response_classified" : "status_changed",
    previous_value: before.current_status, new_value: status,
    details: { previous_response: before.response_classification, suppression_reason: patch.suppression_reason || null }
  });
  return NextResponse.json({ lead: updated });
}
