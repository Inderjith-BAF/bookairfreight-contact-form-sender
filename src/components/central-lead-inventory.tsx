"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { ArrowDownToLine, Check, FileUp, GripVertical, LoaderCircle, RefreshCw, Search, Upload, Users } from "lucide-react";

type TeamMember = { id: string; full_name: string; role: string; active: boolean };
type Lead = { id: string; [key: string]: any };
const COLUMNS = [
  ["location_on_site","Location On Site"],["country","Country"],["company_name","Company Name"],
  ["first_name","First Name"],["last_name","Last Name"],["title","Title"],["email","Email"],
  ["main_product_description","Main Product Description"],["secondary_product_description","Secondary Production Description (check)"],
  ["main_industry","Main Industry"],["main_additional_tag","Main Additional Tag"],["secondary_industry","Seondary Industry"],
  ["secondary_additional_tag","Seondary Additional Tag"],["qualified_lead","Qualified lead?"],["assigned_to","Assigned To"],
  ["assigned_date","Assigned Date"],["ecommerce_platform_used","Ecommerce platform used"],
  ["data_from_lead_generation_team","Data from lead generation team"],
  ["data_source","Data source (need to indicate which raw data sheet you are using)"],
  ["email_finding_assigned_to","(Email Finding)     Assigned To"],["email_finding_assigned_date","(Email Finding)     Assigned Date"],
  ["business_personal_email","Business / Personal Email"],["contact_form","Contact form"],["fresh_outreach_assigned_to","Assigned to(Fresh Outreach)"],
  ["fresh_outreach_assigned_date","Assigned Date(Fresh Outreach)"]
] as const;

const COUNTRY_ALIASES: Record<string, string> = {
  "australia":"Australia","commonwealth of australia":"Australia","uk": "United Kingdom","u k": "United Kingdom","gb": "United Kingdom","gbr": "United Kingdom","great britain": "United Kingdom","britain": "United Kingdom","england": "United Kingdom","scotland": "United Kingdom","wales": "United Kingdom","northern ireland": "United Kingdom","united kingdom": "United Kingdom",
  "albania":"EU","andorra":"EU","austria":"EU","belarus":"EU","belgium":"EU","bosnia and herzegovina":"EU","bulgaria":"EU","croatia":"EU","cyprus":"EU","czechia":"EU","denmark":"EU","estonia":"EU","finland":"EU","france":"EU","germany":"EU","greece":"EU","hungary":"EU","iceland":"EU","ireland":"EU","italy":"EU","kosovo":"EU","latvia":"EU","liechtenstein":"EU","lithuania":"EU","luxembourg":"EU","malta":"EU","monaco":"EU","montenegro":"EU","north macedonia":"EU","norway":"EU","poland":"EU","portugal":"EU","romania":"EU","san marino":"EU","serbia":"EU","slovakia":"EU","slovenia":"EU","spain":"EU","sweden":"EU","switzerland":"EU","ukraine":"EU","vatican city":"EU","us":"United States","u s":"United States","usa":"United States","u s a":"United States","united states of america":"United States","america":"United States",
  "uae":"United Arab Emirates","u a e":"United Arab Emirates","emirates":"United Arab Emirates",
  "south korea":"South Korea","republic of korea":"South Korea","korea south":"South Korea","kr":"South Korea",
  "north korea":"North Korea","korea north":"North Korea","kp":"North Korea",
  "russia":"Russia","russian federation":"Russia",
  "viet nam":"Vietnam",
  "ivory coast":"Côte d’Ivoire","cote d ivoire":"Côte d’Ivoire",
  "turkiye":"Türkiye","turkey":"Türkiye",
  "czech republic":"Czechia",
  "holland":"Netherlands","the netherlands":"Netherlands",
  "mainland china":"China","pr china":"China","people s republic of china":"China","p r china":"China",
  "hong kong sar":"Hong Kong","hong kong s a r":"Hong Kong",
  "taiwan roc":"Taiwan","republic of china":"Taiwan",
  "macau":"Macao",
  "tanzania":"Tanzania","united republic of tanzania":"Tanzania",
  "bolivia":"Bolivia","bolivia plurinational state of":"Bolivia",
  "venezuela":"Venezuela","venezuela bolivarian republic of":"Venezuela",
  "iran":"Iran","iran islamic republic of":"Iran",
  "syria":"Syria","syrian arab republic":"Syria",
  "moldova":"Moldova","moldova republic of":"Moldova",
  "laos":"Laos","lao people s democratic republic":"Laos",
  "brunei darussalam":"Brunei",
  "cape verde":"Cabo Verde",
  "swaziland":"Eswatini",
  "macedonia":"North Macedonia",
  "burma":"Myanmar",
  "côte d ivoire":"Côte d’Ivoire",
  "palestine":"Palestine","state of palestine":"Palestine",
  "vatican":"Vatican City","holy see":"Vatican City"
};
function normalizeCountry(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/[._-]/g, " ").replace(/\s+/g, " ").trim();
  const alias = COUNTRY_ALIASES[key];
  if (alias) return alias;
  return raw.toLocaleLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

type AssignmentField = "fresh_outreach_assigned_to" | "fresh_outreach_assigned_date";
type DragFill = { field: AssignmentField; value: string } | null;

export function CentralLeadInventory() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [token, setToken] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [currentRole, setCurrentRole] = useState("");
  const [q, setQ] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const tablePageSize = 100;
  const [source, setSource] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dragFill, setDragFill] = useState<DragFill>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkAssignCount, setBulkAssignCount] = useState(400);
  const [columnFilters, setColumnFilters] = useState<Record<string,string>>({});
  const [excelFilters, setExcelFilters] = useState<Record<string,string[]>>({});
  const [openExcelFilter, setOpenExcelFilter] = useState<string | null>(null);
  const [draftExcelFilter, setDraftExcelFilter] = useState<string[]>([]);
  const [excelFilterSearch, setExcelFilterSearch] = useState("");
  const [excelFilterPosition, setExcelFilterPosition] = useState<{top:number;left:number} | null>(null);
  const [summary, setSummary] = useState<{added:number;duplicate:number;invalid:number;total:number;results?:{row:number;email:string;result:string;reason:string}[]}|null>(null);
  const load = useCallback(async (t: string) => {
    const params = new URLSearchParams({ q, source });
    const res = await fetch("/api/lead-inventory?" + params, { headers: { Authorization: "Bearer " + t } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load central inventory");
    setLeads(data.leads || []); setTeam(data.team || []); setCurrentRole(String(data.currentRole || "").toLowerCase());
    setSelected(old => old.filter(id => (data.leads || []).some((row:Lead) => row.id === id)));
  }, [q, source]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) { setError("Sign in through the existing Outbound OS first."); return; }
      setToken(data.session.access_token);
      try { await load(data.session.access_token); } catch (e) { setError(e instanceof Error ? e.message : "Could not load inventory"); }
    })();
    return () => { alive = false; };
  }, [supabase, load]);
  useEffect(() => { if (token) load(token).catch(e => setError(e instanceof Error ? e.message : "Could not refresh inventory")); }, [token, load]);

  async function uploadRows(rows: Record<string, unknown>[]) {
    if (!token || !rows.length) return;
    setBusy(true); setError(""); setMessage(""); setSummary(null);
    const batchSize = 400;
    let added = 0, duplicate = 0, invalid = 0, processed = 0;
    const results: {row:number;email:string;result:string;reason:string}[] = [];
    try {
      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize);
        const res = await fetch("/api/lead-inventory", {
          method: "POST",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch })
        });
        const responseText = await res.text();
        let data: any;
        try {
          data = JSON.parse(responseText);
        } catch {
          const detail = responseText.trim().slice(0, 180);
          throw new Error("Upload batch " + (Math.floor(offset / batchSize) + 1) + " failed (HTTP " + res.status + "). " + (detail || "The server returned a non-JSON response."));
        }
        if (!res.ok) throw new Error(data.error || "Upload batch " + (Math.floor(offset / batchSize) + 1) + " failed.");
        added += Number(data.added || 0);
        duplicate += Number(data.duplicate || 0);
        invalid += Number(data.invalid || 0);
        processed += batch.length;
        for (const item of data.results || []) results.push({ ...item, row: Number(item.row || 0) + offset });
        setMessage("Processing leads: " + processed.toLocaleString() + " of " + rows.length.toLocaleString() + "…");
      }
      setSummary({ added, duplicate, invalid, total: rows.length, results });
      setMessage("Upload complete. Added " + added.toLocaleString() + ", skipped duplicates " + duplicate.toLocaleString() + ", invalid " + invalid.toLocaleString() + ". Existing Master Lead Sheet records were not changed.");
      setPaste("");
      await load(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  async function parseAndUpload(file?: File) {
    if (file) {
      const wb = XLSX.read(await file.arrayBuffer(), {type:"array"});
      const grid = XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]], {defval:""});
      await uploadRows(grid); return;
    }
    if (!paste.trim()) return;
    const wb = XLSX.read(paste, {type:"string"});
    const grid = XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]], {defval:""});
    await uploadRows(grid);
  }
  async function fillAssignment(ids: string[], field: AssignmentField, value: string) {
    if (!token || !ids.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/lead-inventory", {method:"PATCH",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({ids,field,value})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save assignment");
      setLeads(old => old.map(row => ids.includes(row.id) ? {...row,[field]:value} : row));
      setMessage(`Copied the same ${field === "fresh_outreach_assigned_to" ? "team member" : "date"} to ${data.updated} row(s).`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save assignment"); }
    finally { setBusy(false); setDragFill(null); }
  }
  function beginDrag(field: AssignmentField, value: string) { setDragFill({field,value}); }
  function dropFill(targetId: string, field: AssignmentField) {
    if (!dragFill || dragFill.field !== field) return;
    const start = leads.findIndex(row => row.id === targetId);
    const sourceId = (window as any).__inventoryDragSource as string | undefined;
    const sourceIndex = leads.findIndex(row => row.id === sourceId);
    const lo = Math.min(start, sourceIndex < 0 ? start : sourceIndex);
    const hi = Math.max(start, sourceIndex < 0 ? start : sourceIndex);
    const ids = leads.slice(lo, hi + 1).map(row => row.id);
    void fillAssignment(ids, field, dragFill.value);
  }
  const excelFilterKeys = ["country", "fresh_outreach_assigned_to", "ecommerce_platform_used", "data_from_lead_generation_team"];
  const excelFilterOptions = (key: string) => Array.from(new Set(leads.map(row => key === "country" ? normalizeCountry(row[key]) : String(row[key] ?? "").trim()))).sort((a,b) => a.localeCompare(b));
  const uniqueLeads = Array.from(new Map(leads.filter(row => row.id).map(row => [row.id, row])).values());
  const visible = uniqueLeads.filter(row => COLUMNS.every(([key]) => {
    const textFilter = columnFilters[key]?.trim();
    if (textFilter && !String(row[key] ?? "").toLowerCase().includes(textFilter.toLowerCase())) return false;
    const selectedValues = excelFilters[key];
    if (excelFilterKeys.includes(key) && selectedValues?.length) {
      const value = key === "country" ? normalizeCountry(row[key]) : String(row[key] ?? "").trim();
      if (key === "fresh_outreach_assigned_to" && selectedValues.some(item => item.trim() !== "") && !value) return false;
      if (!selectedValues.includes(value)) return false;
    }
    if (key === "fresh_outreach_assigned_to" && textFilter && !String(row.fresh_outreach_assigned_to ?? "").trim()) return false;
    return true;
  }));
  const openExcelFilterMenu = (key: string, rect?: DOMRect) => {
    if (rect) setExcelFilterPosition({top: Math.min(rect.bottom + 4, window.innerHeight - 320), left: Math.min(rect.left, window.innerWidth - 280)});
    setOpenExcelFilter(key);
    setDraftExcelFilter(excelFilters[key] ?? []);
    setExcelFilterSearch("");
  };
  const toggleDraftExcelValue = (value: string) => setDraftExcelFilter(old => old.includes(value) ? old.filter(item => item !== value) : [...old, value]);
  const applyExcelFilter = () => {
    if (!openExcelFilter) return;
    setExcelFilters(old => ({...old, [openExcelFilter]: draftExcelFilter}));
    setOpenExcelFilter(null);
  };
  const pageCount = Math.max(1, Math.ceil(visible.length / tablePageSize));
  const currentPage = Math.min(tablePage, pageCount);
  const pageRows = visible.slice((currentPage - 1) * tablePageSize, currentPage * tablePageSize);
  const visibleIds = [...new Set(visible.map(row => row.id).filter(Boolean))];
  const selectedVisibleIds = visibleIds.filter(id => selected.includes(id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.includes(id));
  const toggleAll = (checked:boolean) => setSelected(old => checked ? [...new Set([...old, ...visibleIds])] : old.filter(id => !visibleIds.includes(id)));
  const downloadSelected = () => {
    const rows = visible.filter(row => selectedVisibleIds.includes(row.id));
    const data = rows.map(row => Object.fromEntries(COLUMNS.map(([key,label]) => [label,row[key] ?? ""])));
    const ws = XLSX.utils.json_to_sheet(data, {header:COLUMNS.map(([,label])=>label)});
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Selected Leads"); XLSX.writeFile(wb,"central-lead-inventory-selection.xlsx");
  };
  async function copyFilteredContactForms() {
    const values = visible
      .map(row => String(row.contact_form ?? "").trim())
      .filter(value => value.length > 0);
    if (!values.length) {
      setMessage("");
      setError("No contact form URLs found in the filtered leads.");
      return;
    }
    try {
      await navigator.clipboard.writeText(values.join(String.fromCharCode(13,10)));
      setMessage("Copied " + values.length + " contact form URL(s), skipped " + (visible.length - values.length) + " blank cell(s).");
      setError("");
    } catch {
      setError("Clipboard access was blocked by the browser. Allow clipboard access and try again.");
    }
  }
  async function copySelectedForMailMerge() {
    const rows = visible.filter(row => selected.includes(row.id));
    if (!rows.length) return;
    const quote = (value: unknown) => {
      const text = String(value ?? "");
      return /[\t\r\n"]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    const tsv = [COLUMNS.map(([,label]) => label).join("\t"), ...rows.map(row => COLUMNS.map(([key]) => quote(row[key])).join("\t"))].join("\r\n");
    try {
      await navigator.clipboard.writeText(tsv);
      setMessage(`Copied ${rows.length} selected leads with the original column headers. Paste them into Mail Merge.`);
      setError("");
    } catch {
      setError("Clipboard access was blocked by the browser. Use Export selected to download the same rows.");
    }
  }
  async function assignRows(ids: string[], value: string) {
    if (!token || !ids.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      let updated = 0;
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        const res = await fetch("/api/lead-inventory", {method:"PATCH",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({ids:batch,field:"fresh_outreach_assigned_to",value})});
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not update assignments");
        updated += Number(data.updated || 0);
      }
      const assignedDate = value ? new Date().toISOString().slice(0,10) : "";
      setLeads(old => old.map(row => ids.includes(row.id) ? {...row,fresh_outreach_assigned_to:value,fresh_outreach_assigned_date:assignedDate} : row));
      setSelected(old => value ? old : old.filter(id => !ids.includes(id)));
      setMessage(value ? `Assigned ${updated} lead(s) to ${value}.` : `Unassigned ${updated} selected lead(s).`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update assignments"); }
    finally { setBusy(false); }
  }
  async function assignQuantityFromFiltered() {
    const quantity = Math.max(1, Math.min(5000, Math.floor(Number(bulkAssignCount) || 0)));
    if (!bulkAssignee) { setError("Choose a team member in Assign to first."); return; }
    const candidates = visible.filter(row => !String(row.fresh_outreach_assigned_to || "").trim()).slice(0, quantity);
    if (!candidates.length) { setError("No unassigned leads match the current filters."); return; }
    await assignRows(candidates.map(row => row.id), bulkAssignee);
  }
  const assignedCount = uniqueLeads.filter(row => String(row.fresh_outreach_assigned_to || "").trim()).length;
  const excelFilterPopup = openExcelFilter && excelFilterPosition && typeof document !== "undefined" ? createPortal(<div style={{position:"fixed",top:excelFilterPosition.top,left:excelFilterPosition.left,zIndex:9999}} className="w-64 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-normal text-slate-800 shadow-xl"><input autoFocus value={excelFilterSearch} onChange={e=>setExcelFilterSearch(e.target.value)} placeholder="Search values" className="mb-2 w-full rounded-md border border-slate-200 px-2 py-1.5 outline-none focus:border-blue-400"/><div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2"><button type="button" onClick={()=>setDraftExcelFilter(excelFilterOptions(openExcelFilter))} className="font-semibold text-blue-700 hover:underline">Select all</button><button type="button" onClick={()=>setDraftExcelFilter([])} className="font-semibold text-slate-500 hover:underline">Clear</button></div><div className="max-h-52 overflow-auto">{excelFilterOptions(openExcelFilter).filter(value=>value.toLowerCase().includes(excelFilterSearch.toLowerCase())).map(value=><label key={value||"__blank"} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 hover:bg-blue-50"><input type="checkbox" checked={draftExcelFilter.includes(value)} onChange={()=>toggleDraftExcelValue(value)} className="rounded border-slate-300"/><span className="truncate">{value || "(Blanks)"}</span></label>)}</div><div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-2"><button type="button" onClick={()=>setOpenExcelFilter(null)} className="rounded-md border border-slate-200 px-3 py-1.5">Cancel</button><button type="button" onClick={applyExcelFilter} className="rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white">Apply</button></div></div>,document.body) : null;
  return <main className="min-h-screen space-y-5 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-3 text-slate-900 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-blue-100 bg-white/90 p-6 shadow-sm">
      <div><div className="text-xs font-black uppercase tracking-[.22em] text-indigo-500">BookAirfreight · Lead Operations</div><h1 className="mt-2 text-3xl font-black">Central Lead Inventory</h1><p className="mt-1 text-sm text-slate-500">Shared lead pool · email-based duplicate protection · spreadsheet-style assignment</p></div>
      <div className="grid grid-cols-3 gap-2 text-center">{[[uniqueLeads.length,"Visible leads"],[uniqueLeads.length-assignedCount,"Unassigned"],[assignedCount,"Assigned"]].map(([n,label])=><div key={String(label)} className="rounded-2xl bg-blue-50 px-4 py-3"><div className="text-xl font-black tabular-nums">{n}</div><div className="text-[10px] font-bold uppercase text-slate-500">{label}</div></div>)}</div>
    </header>
    {["admin", "lead_generation_admin"].includes(currentRole) && (
    <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><Upload size={18} className="text-indigo-500"/><h2 className="text-lg font-black">Upload new leads</h2></div>
      <p className="mt-1 text-sm text-slate-500">Paste or upload a spreadsheet with your exact universal column headers in row one. Only new email addresses are inserted; duplicate emails are skipped.</p>
      <textarea value={paste} onChange={e=>setPaste(e.target.value)} placeholder="Paste spreadsheet cells including the 24 headers…" className="mt-4 min-h-32 w-full rounded-xl border border-blue-100 bg-slate-50 p-3 font-mono text-xs"/>
      <div className="mt-3 flex flex-wrap items-center gap-3"><button disabled={busy||!paste.trim()} onClick={()=>void parseAndUpload()} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy?<LoaderCircle className="inline animate-spin" size={15}/>:<FileUp className="inline" size={15}/>} Validate & upload</button><label className="cursor-pointer rounded-xl border border-blue-100 px-4 py-2.5 text-sm font-bold text-indigo-600"><Upload className="mr-1 inline" size={15}/> Upload CSV / Excel<input type="file" accept=".csv,.xlsx,.xls" className="hidden" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void parseAndUpload(f);e.currentTarget.value="";}}/></label>{summary&&<div className="text-xs font-semibold text-slate-600">Processed {summary.total} · Added {summary.added} · Duplicate {summary.duplicate} · Invalid {summary.invalid}{summary.invalid>0&&<div className="mt-2 max-h-40 overflow-auto rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800"><strong>Skipped rows and reasons</strong>{summary.results?.filter(item=>item.result==="Skipped"&&item.reason!=="Email already exists in Central Lead Inventory").map(item=><div key={item.row}>Row {item.row}{item.email?` (${item.email})`:""}: {item.reason}</div>)}</div>}</div>}</div>
      {message&&<p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}{error&&<p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </section>
    )}
    <section className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-50 p-4"><div><h2 className="font-black">Central inventory sheet</h2></div><div className="flex flex-wrap gap-2"><label className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search all columns" className="w-48 rounded-xl border border-blue-100 py-2 pl-8 pr-3 text-sm"/></label><input value={source} onChange={e=>setSource(e.target.value)} placeholder="Filter data source" className="w-44 rounded-xl border border-blue-100 px-3 py-2 text-sm"/><button onClick={()=>setSelected(old=>[...new Set([...old,...visibleIds])])} disabled={!visibleIds.length||allVisibleSelected} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-40">Select all filtered ({visibleIds.length})</button><button onClick={()=>setSelected(old=>old.filter(id=>!visibleIds.includes(id)))} disabled={!visibleIds.some(id=>selected.includes(id))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40">Clear filtered</button><button onClick={()=>void copyFilteredContactForms()} disabled={!visible.length} className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800 disabled:opacity-40">Copy contact forms ({visible.length})</button><button onClick={()=>void copySelectedForMailMerge()} disabled={!selected.length} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"><Check className="mr-1 inline" size={15}/> Copy for Mail Merge ({selected.length})</button><select value={bulkAssignee} onChange={e=>setBulkAssignee(e.target.value)} className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm"><option value="">Assign to…</option>{team.map(member=><option key={member.id} value={member.full_name}>{member.full_name}</option>)}</select><label className="flex items-center gap-2 rounded-xl border border-blue-100 px-2 py-1 text-xs text-slate-500">Assign <input type="number" min={1} max={5000} value={bulkAssignCount} onChange={e=>setBulkAssignCount(Number(e.target.value))} className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-800"/> from filtered</label><button onClick={()=>void assignQuantityFromFiltered()} disabled={busy||!bulkAssignee||!visible.some(row=>!String(row.fresh_outreach_assigned_to||"").trim())} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-40">Assign from filtered</button><button onClick={()=>void assignRows(selectedVisibleIds,bulkAssignee)} disabled={busy||!selectedVisibleIds.length||!bulkAssignee} className="rounded-xl border border-emerald-200 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-40">Assign selected ({selectedVisibleIds.length})</button><button onClick={()=>void assignRows(selectedVisibleIds,"")} disabled={busy||!selectedVisibleIds.length} className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-bold text-rose-600 disabled:opacity-40">Unassign selected ({selectedVisibleIds.length})</button>{["admin","lead_generation_admin"].includes(currentRole) && <button onClick={downloadSelected} disabled={!selectedVisibleIds.length} className="rounded-xl border border-blue-100 px-3 py-2 text-sm font-bold text-indigo-600 disabled:opacity-40"><ArrowDownToLine className="mr-1 inline" size={15}/> Export selected</button>}<button onClick={()=>token&&load(token)} className="rounded-xl border border-blue-100 p-2 text-indigo-600" title="Refresh"><RefreshCw size={16}/></button></div></div>
      <div className="max-h-[70vh] overflow-auto"><table className="w-max min-w-full border-collapse text-left text-xs"><thead className="sticky top-0 z-20 bg-blue-50 text-[11px] font-black text-slate-600"><tr><th className="sticky left-0 z-30 bg-blue-50 px-3 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={e=>toggleAll(e.target.checked)} aria-label="Select all filtered results"/></th>{COLUMNS.map(([,label])=><th key={label} className="min-w-44 whitespace-nowrap border-b border-blue-100 px-3 py-3">{label}</th>)}</tr><tr className="bg-amber-50"><th className="sticky left-0 z-30 bg-amber-50 px-2 py-2 text-[10px] text-amber-900">FILTER</th>{COLUMNS.map(([key,label])=><th key={key} className="relative border-b border-amber-100 px-2 py-2">{excelFilterKeys.includes(key) ? <div className="relative min-w-40"><button type="button" aria-label={"Excel filter "+label} aria-expanded={openExcelFilter===key} onClick={e=>openExcelFilter===key?setOpenExcelFilter(null):openExcelFilterMenu(key,e.currentTarget.getBoundingClientRect())} className={"flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] font-normal "+(excelFilters[key]?.length?"border-blue-400 bg-blue-50 text-blue-900":"border-amber-200 bg-white text-slate-600")}><span className="truncate">{excelFilters[key]?.length ? excelFilters[key].length+" selected" : "Filter "+label}</span><span>▾</span></button></div> : <input type={key === "fresh_outreach_assigned_date" ? "date" : "text"} aria-label={"Filter "+label} value={columnFilters[key]||""} onChange={e=>setColumnFilters(old=>({...old,[key]:e.target.value}))} placeholder={"Filter "+label} className="w-40 rounded-md border border-amber-200 bg-white px-2 py-1.5 text-[11px] font-normal text-slate-800 placeholder:text-slate-400"/>}</th>)}</tr></thead><tbody>{pageRows.map((row,index)=><tr key={row.id} className={index%2?"bg-slate-50/70":"bg-white"}><td className="sticky left-0 z-10 border-b border-blue-50 bg-inherit px-3 py-2"><input type="checkbox" checked={selected.includes(row.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,row.id]:old.filter(id=>id!==row.id))} aria-label={"Select "+row.email}/></td>{COLUMNS.map(([key,label])=><td key={key} onDragOver={e=>{if(key==="fresh_outreach_assigned_to"||key==="fresh_outreach_assigned_date")e.preventDefault()}} onDrop={e=>{if(key==="fresh_outreach_assigned_to"||key==="fresh_outreach_assigned_date"){e.preventDefault();dropFill(row.id,key)}}} className="border-b border-blue-50 px-3 py-2 align-top"><div className="flex min-w-36 items-center gap-1">{key==="fresh_outreach_assigned_to"?<><select value={row[key]||""} disabled={busy} onChange={e=>void fillAssignment([row.id],key,e.target.value)} onDragStart={()=>beginDrag(key,row[key]||"")} onDragEnd={()=>setDragFill(null)} draggable={Boolean(row[key])} onMouseDown={()=>{(window as any).__inventoryDragSource=row.id}} className="w-48 rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-xs"><option value="">Unassigned</option>{team.map(member=><option key={member.id} value={member.full_name}>{member.full_name}</option>)}</select><span title="Drag this cell to copy the selected member" draggable onDragStart={e=>{(window as any).__inventoryDragSource=row.id;beginDrag(key,row[key]||"");e.dataTransfer.effectAllowed="copy"}} className="cursor-grab text-slate-400"><GripVertical size={15}/></span></>:key==="fresh_outreach_assigned_date"?<><input type="date" value={row[key]||""} disabled={busy} onChange={e=>void fillAssignment([row.id],key,e.target.value)} onMouseDown={()=>{(window as any).__inventoryDragSource=row.id}} className="w-40 rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-xs"/><span title="Drag this cell to copy the exact date" draggable onDragStart={e=>{(window as any).__inventoryDragSource=row.id;beginDrag(key,row[key]||"");e.dataTransfer.effectAllowed="copy"}} className="cursor-grab text-slate-400"><GripVertical size={15}/></span></>:<span className="max-w-72 whitespace-normal break-words">{row[key]||"—"}</span>}</div></td>)}</tr>)}</tbody></table>{!visible.length&&<div className="p-10 text-center text-sm text-slate-500">No inventory leads found. Upload new leads to populate this sheet.</div>}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-blue-50 px-4 py-3 text-xs text-slate-500"><div><Users className="mr-1 inline" size={14}/>{visible.length.toLocaleString()} filtered leads · showing {visible.length ? ((currentPage - 1) * tablePageSize + 1).toLocaleString() + "–" + Math.min(currentPage * tablePageSize, visible.length).toLocaleString() : "0"} · {selectedVisibleIds.length.toLocaleString()} selected in current filter. Selection from other filters is not included in these actions.</div><div className="flex items-center gap-2"><button type="button" disabled={currentPage <= 1} onClick={() => setTablePage(p => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" disabled={currentPage >= pageCount} onClick={() => setTablePage(p => Math.min(pageCount, p + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button></div></div>
    </section>
  {excelFilterPopup}</main>;
}