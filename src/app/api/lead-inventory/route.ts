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
  const filterOptionFields = ["country","fresh_outreach_assigned_to","ecommerce_platform_used","data_from_lead_generation_team"] as const;
  if (url.searchParams.get("filterOptions") === "1") {
    const options: Record<string,string[]> = {};
    for (const field of filterOptionFields) {
      const values = new Set<string>();
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.from("central_lead_inventory").select(field+",id").not(field,"is",null).order(field,{ascending:true}).order("id",{ascending:true}).range(offset,offset+999);
        if (error) return NextResponse.json({error:error.message},{status:500});
        for (const row of data || []) { const value = clean((row as any)[field]); if (value) values.add(value); }
        if (!data || data.length < 1000) break;
      }
      options[field] = [...values].sort((a,b)=>a.localeCompare(b));
    }
    return NextResponse.json({options});
  }
  // Apply text and source filters in Postgres so broad searches do not transfer
  // the entire inventory to the function before filtering it in memory.
  const pageSize = 1000;
  const leads: any[] = [];
  const searchable = [
    "location_on_site","country","company_name","first_name","last_name","title","email",
    "main_product_description","secondary_product_description","main_industry","main_additional_tag",
    "secondary_industry","secondary_additional_tag","qualified_lead","assigned_to","assigned_date",
    "ecommerce_platform_used","data_from_lead_generation_team","data_source","email_finding_assigned_to",
    "email_finding_assigned_date","business_personal_email","contact_form","fresh_outreach_assigned_to","fresh_outreach_assigned_date"
  ];
  const safeQuery = q.replace(/[\\,()%]/g, " ").trim();
  const safeSource = source.replace(/[\\,%_]/g, " ").trim();
  // Opt-in server pagination. The existing full-response path remains
  // available until the inventory UI is switched over in the next phase.
  if (url.searchParams.has("page")) {
    const pageNumber = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const requestedSize = Number.parseInt(url.searchParams.get("pageSize") || "100", 10) || 100;
    const size = Math.min(200, Math.max(1, requestedSize));
    const allowed = new Set(searchable);
    const excelKeys = new Set(["country", "fresh_outreach_assigned_to", "ecommerce_platform_used", "data_from_lead_generation_team"]);
    let parsed: { columnFilters?: Record<string, unknown>; excelFilters?: Record<string, unknown> } = {};
    try { parsed = JSON.parse(url.searchParams.get("filters") || "{}"); }
    catch { return NextResponse.json({ error: "Invalid inventory filters." }, { status: 400 }); }
    let query: any = admin.from("central_lead_inventory")
      .select("id,location_on_site,country,company_name,first_name,last_name,title,email,main_product_description,secondary_product_description,main_industry,main_additional_tag,secondary_industry,secondary_additional_tag,qualified_lead,assigned_to,assigned_date,ecommerce_platform_used,data_from_lead_generation_team,data_source,email_finding_assigned_to,email_finding_assigned_date,business_personal_email,contact_form,fresh_outreach_assigned_to,fresh_outreach_assigned_date,created_at,updated_at", { count: "exact" })
      .order("created_at", { ascending: false }).order("id", { ascending: true });
    if (safeSource) query = query.ilike("data_source", "%" + safeSource + "%");
    if (safeQuery) query = query.or(searchable.map(field => field + ".ilike.*" + safeQuery + "*").join(","));
    for (const [field, rawValue] of Object.entries(parsed.columnFilters || {})) {
      if (!allowed.has(field)) continue;
      const value = clean(rawValue);
      if (value) query = query.ilike(field, "%" + value.replace(/[\\\\,%_]/g, " ") + "%");
    }
    for (const [field, rawValues] of Object.entries(parsed.excelFilters || {})) {
      if (!excelKeys.has(field) || !Array.isArray(rawValues)) continue;
      const values = rawValues.map(value => String(value ?? "").trim());
      if (values.length) {
        if (field === "country" && values.includes("EU")) {
          const euCountries = ["Albania","Andorra","Austria","Belarus","Belgium","Bosnia and Herzegovina","Bulgaria","Croatia","Cyprus","Czechia","Denmark","Estonia","Finland","France","Germany","Greece","Hungary","Iceland","Ireland","Italy","Kosovo","Latvia","Liechtenstein","Lithuania","Luxembourg","Malta","Moldova","Monaco","Montenegro","Netherlands","North Macedonia","Norway","Poland","Portugal","Romania","San Marino","Serbia","Slovakia","Slovenia","Spain","Sweden","Switzerland","Ukraine","Vatican City"];
          query = query.in("country", [...new Set([...values.filter(value=>value!=="EU"), ...euCountries])]);
        } else query = query.in(field, values);
      }
    }
    const start = (pageNumber - 1) * size;
    const { data, error, count } = await query.range(start, start + size - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ leads: data || [], total: count || 0, page: pageNumber, pageSize: size,
      pageCount: Math.max(1, Math.ceil((count || 0) / size)), team: members || [], currentRole: auth.profile.role });
  }

  for (let offset = 0; ; offset += pageSize) {
    let query = admin.from("central_lead_inventory").select("id,location_on_site,country,company_name,first_name,last_name,title,email,main_product_description,secondary_product_description,main_industry,main_additional_tag,secondary_industry,secondary_additional_tag,qualified_lead,assigned_to,assigned_date,ecommerce_platform_used,data_from_lead_generation_team,data_source,email_finding_assigned_to,email_finding_assigned_date,business_personal_email,contact_form,fresh_outreach_assigned_to,fresh_outreach_assigned_date,created_at,updated_at")
      .order("created_at", { ascending: false }).order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (safeSource) query = query.ilike("data_source", "%" + safeSource + "%");
    if (safeQuery) query = query.or(searchable.map(field => field + ".ilike.*" + safeQuery + "*").join(","));
    const { data: page, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    leads.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }
  return NextResponse.json({ leads, total: leads.length, team: members || [], currentRole: auth.profile.role });
}

export async function POST(request: Request) {
  const auth = await requireOutboundUser(request);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const body = await request.json().catch(() => null);
  if (body?.action === "assign-filtered") {
    const quantity = Math.max(1, Math.min(5000, Math.floor(Number(body.quantity) || 0)));
    const assignee = clean(body.assignee);
    if (!assignee) return NextResponse.json({error:"Choose an active team member."},{status:400});
    const {data:person,error:personError}=await admin.from("outbound_profiles").select("id,full_name,active").eq("full_name",assignee).eq("active",true).maybeSingle();
    if(personError||!person)return NextResponse.json({error:"Select an active team member from the dropdown."},{status:400});
    const filters = body.filters && typeof body.filters === "object" ? body.filters : {};
    const columnFilters = filters.columnFilters && typeof filters.columnFilters === "object" ? filters.columnFilters : {};
    const excelFilters = filters.excelFilters && typeof filters.excelFilters === "object" ? filters.excelFilters : {};
    const searchTerm=clean(body.q).toLowerCase().replace(/[\\\\,()%]/g," ").trim();
    const sourceTerm=clean(body.source).replace(/[\\\\,%_]/g," ").trim();
    const searchable=["location_on_site","country","company_name","first_name","last_name","title","email","main_product_description","secondary_product_description","main_industry","main_additional_tag","secondary_industry","secondary_additional_tag","qualified_lead","assigned_to","assigned_date","ecommerce_platform_used","data_from_lead_generation_team","data_source","email_finding_assigned_to","email_finding_assigned_date","business_personal_email","contact_form","fresh_outreach_assigned_to","fresh_outreach_assigned_date"];
    const allowed = new Set(searchable);
    const excelKeys = new Set(["country","fresh_outreach_assigned_to","ecommerce_platform_used","data_from_lead_generation_team"]);
    let query:any=admin.from("central_lead_inventory").select("id").or("fresh_outreach_assigned_to.is.null,fresh_outreach_assigned_to.eq.").order("created_at",{ascending:false}).order("id",{ascending:true});
    if(sourceTerm)query=query.ilike("data_source","%"+sourceTerm+"%");
    if(searchTerm)query=query.or(searchable.map(field=>field+".ilike.*"+searchTerm+"*").join(","));
    for(const [field,rawValue] of Object.entries(columnFilters)){if(!allowed.has(field))continue;const value=clean(rawValue);if(value)query=query.ilike(field,"%"+value.replace(/[\\\\,%_]/g," ")+"%");}
    for(const [field,rawValues] of Object.entries(excelFilters)){
      if(!excelKeys.has(field)||!Array.isArray(rawValues))continue;
      const values=rawValues.map(value=>String(value??"").trim());
      if(!values.length)continue;
      if(field==="country"&&values.includes("EU")){
        const euCountries=["Albania","Andorra","Austria","Belarus","Belgium","Bosnia and Herzegovina","Bulgaria","Croatia","Cyprus","Czechia","Denmark","Estonia","Finland","France","Germany","Greece","Hungary","Iceland","Ireland","Italy","Kosovo","Latvia","Liechtenstein","Lithuania","Luxembourg","Malta","Moldova","Monaco","Montenegro","Netherlands","North Macedonia","Norway","Poland","Portugal","Romania","San Marino","Serbia","Slovakia","Slovenia","Spain","Sweden","Switzerland","Ukraine","Vatican City"];
        query=query.in("country",[...new Set([...values.filter(value=>value!=="EU"),...euCountries])]);
      } else query=query.in(field,values);
    }
    const ids:string[]=[];
    for(let offset=0;offset<quantity;offset+=1000){
      const {data:targets,error:targetError}=await query.range(offset,Math.min(offset+999,quantity-1));
      if(targetError)return NextResponse.json({error:targetError.message},{status:500});
      ids.push(...(targets||[]).map((row:any)=>String(row.id)));
      if(!targets||targets.length<Math.min(1000,quantity-offset))break;
    }
    if(!ids.length)return NextResponse.json({updated:0,requested:quantity,message:"No unassigned leads match the current filters."});
    let updated=0;const assignedDate=new Date().toISOString().slice(0,10);
    for(let offset=0;offset<ids.length;offset+=500){
      const batch=ids.slice(offset,offset+500);
      const {error:updateError}=await admin.from("central_lead_inventory").update({fresh_outreach_assigned_to:assignee,fresh_outreach_assigned_date:assignedDate,updated_at:new Date().toISOString()}).in("id",batch);
      if(updateError)return NextResponse.json({error:updateError.message,updated},{status:500});
      updated+=batch.length;
    }
    return NextResponse.json({updated,requested:quantity,assignee});
  }
  if (!["admin","lead_generation_admin"].includes(profile.role)) return NextResponse.json({error:"You do not have permission to upload leads."},{status:403});
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