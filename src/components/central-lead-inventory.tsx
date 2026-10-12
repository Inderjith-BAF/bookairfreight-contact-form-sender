"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
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
type AssignmentField = "fresh_outreach_assigned_to" | "fresh_outreach_assigned_date";
type DragFill = { field: AssignmentField; value: string } | null;

export function CentralLeadInventory() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [token, setToken] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [currentRole, setCurrentRole] = useState("");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dragFill, setDragFill] = useState<DragFill>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [columnFilters, setColumnFilters] = useState<Record<string,string>>({});
  const [summary, setSummary] = useState<{added:number;duplicate:number;invalid:number;total:number}|null>(null);
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
    try {
      const res = await fetch("/api/lead-inventory", { method:"POST", headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"}, body:JSON.stringify({rows}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setSummary({added:data.added,duplicate:data.duplicate,invalid:data.invalid,total:data.total});
      setMessage("Inventory upload reconciled. Existing emails were skipped; no Master Lead Sheet records were changed.");
      setPaste(""); await load(token);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
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
  const visible = leads.filter(row => COLUMNS.every(([key]) => !columnFilters[key]?.trim() || String(row[key] ?? "").toLowerCase().includes(columnFilters[key].trim().toLowerCase())));
  const visibleIds = visible.map(row => row.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.includes(id));
  const toggleAll = (checked:boolean) => setSelected(old => checked ? [...new Set([...old, ...visibleIds])] : old.filter(id => !visibleIds.includes(id)));
  const downloadSelected = () => {
    const rows = visible.filter(row => selected.includes(row.id));
    const data = rows.map(row => Object.fromEntries(COLUMNS.map(([key,label]) => [label,row[key] ?? ""])));
    const ws = XLSX.utils.json_to_sheet(data, {header:COLUMNS.map(([,label])=>label)});
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Selected Leads"); XLSX.writeFile(wb,"central-lead-inventory-selection.xlsx");
  };
  async function copyFilteredContactForms() {
    const values = ["Contact form", ...visible.map(row => String(row.contact_form ?? ""))];
    try { await navigator.clipboard.writeText(values.join(String.fromCharCode(13,10))); setMessage(`Copied Contact form values for ${visible.length} filtered leads, including blank cells.`); setError(""); }
    catch { setError("Clipboard access was blocked by the browser. Allow clipboard access and try again."); }
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
  const assignedCount = leads.filter(row => String(row.fresh_outreach_assigned_to || "").trim()).length;
  return <main className="min-h-screen space-y-5 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-3 text-slate-900 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-blue-100 bg-white/90 p-6 shadow-sm">
      <div><div className="text-xs font-black uppercase tracking-[.22em] text-indigo-500">BookAirfreight · Lead Operations</div><h1 className="mt-2 text-3xl font-black">Central Lead Inventory</h1><p className="mt-1 text-sm text-slate-500">Shared lead pool · email-based duplicate protection · spreadsheet-style assignment</p></div>
      <div className="grid grid-cols-3 gap-2 text-center">{[[leads.length,"Visible leads"],[leads.length-assignedCount,"Unassigned"],[assignedCount,"Assigned"]].map(([n,label])=><div key={String(label)} className="rounded-2xl bg-blue-50 px-4 py-3"><div className="text-xl font-black tabular-nums">{n}</div><div className="text-[10px] font-bold uppercase text-slate-500">{label}</div></div>)}</div>
    </header>
    <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><Upload size={18} className="text-indigo-500"/><h2 className="text-lg font-black">Upload new leads</h2></div>
      <p className="mt-1 text-sm text-slate-500">Paste or upload a spreadsheet with your exact universal column headers in row one. Only new email addresses are inserted; duplicate emails are skipped.</p>
      <textarea value={paste} onChange={e=>setPaste(e.target.value)} placeholder="Paste spreadsheet cells including the 24 headers…" className="mt-4 min-h-32 w-full rounded-xl border border-blue-100 bg-slate-50 p-3 font-mono text-xs"/>
      <div className="mt-3 flex flex-wrap items-center gap-3"><button disabled={busy||!paste.trim()} onClick={()=>void parseAndUpload()} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy?<LoaderCircle className="inline animate-spin" size={15}/>:<FileUp className="inline" size={15}/>} Validate & upload</button><label className="cursor-pointer rounded-xl border border-blue-100 px-4 py-2.5 text-sm font-bold text-indigo-600"><Upload className="mr-1 inline" size={15}/> Upload CSV / Excel<input type="file" accept=".csv,.xlsx,.xls" className="hidden" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void parseAndUpload(f);e.currentTarget.value="";}}/></label>{summary&&<span className="text-xs font-semibold text-slate-600">Processed {summary.total} · Added {summary.added} · Duplicate {summary.duplicate} · Invalid {summary.invalid}</span>}</div>
      {message&&<p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}{error&&<p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </section>
    <section className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-50 p-4"><div><h2 className="font-black">Central inventory sheet</h2></div><div className="flex flex-wrap gap-2"><label className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search all columns" className="w-48 rounded-xl border border-blue-100 py-2 pl-8 pr-3 text-sm"/></label><input value={source} onChange={e=>setSource(e.target.value)} placeholder="Filter data source" className="w-44 rounded-xl border border-blue-100 px-3 py-2 text-sm"/><button onClick={()=>setSelected(old=>[...new Set([...old,...visibleIds])])} disabled={!visibleIds.length||allVisibleSelected} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-40">Select all filtered ({visibleIds.length})</button><button onClick={()=>setSelected(old=>old.filter(id=>!visibleIds.includes(id)))} disabled={!visibleIds.some(id=>selected.includes(id))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40">Clear filtered</button><button onClick={()=>void copyFilteredContactForms()} disabled={!visible.length} className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800 disabled:opacity-40">Copy contact forms ({visible.length})</button><button onClick={()=>void copySelectedForMailMerge()} disabled={!selected.length} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"><Check className="mr-1 inline" size={15}/> Copy for Mail Merge ({selected.length})</button>{["admin","lead_generation_admin"].includes(currentRole) && <button onClick={downloadSelected} disabled={!selected.length} className="rounded-xl border border-blue-100 px-3 py-2 text-sm font-bold text-indigo-600 disabled:opacity-40"><ArrowDownToLine className="mr-1 inline" size={15}/> Export selected</button>}<button onClick={()=>token&&load(token)} className="rounded-xl border border-blue-100 p-2 text-indigo-600" title="Refresh"><RefreshCw size={16}/></button></div></div>
      <div className="max-h-[70vh] overflow-auto"><table className="w-max min-w-full border-collapse text-left text-xs"><thead className="sticky top-0 z-20 bg-blue-50 text-[11px] font-black text-slate-600"><tr><th className="sticky left-0 z-30 bg-blue-50 px-3 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={e=>toggleAll(e.target.checked)} aria-label="Select all filtered results"/></th>{COLUMNS.map(([,label])=><th key={label} className="min-w-44 whitespace-nowrap border-b border-blue-100 px-3 py-3">{label}</th>)}</tr><tr className="bg-amber-50">{<th className="sticky left-0 z-30 bg-amber-50 px-2 py-2 text-[10px] text-amber-900">FILTER</th>}{COLUMNS.map(([key,label])=><th key={key} className="border-b border-amber-100 px-2 py-2"><input aria-label={"Filter "+label} value={columnFilters[key]||""} onChange={e=>setColumnFilters(old=>({...old,[key]:e.target.value}))} placeholder={"Filter "+label} className="w-40 rounded-md border border-amber-200 bg-white px-2 py-1.5 text-[11px] font-normal text-slate-800 placeholder:text-slate-400"/></th>)}</tr></thead><tbody>{visible.map((row,index)=><tr key={row.id} className={index%2?"bg-slate-50/70":"bg-white"}><td className="sticky left-0 z-10 border-b border-blue-50 bg-inherit px-3 py-2"><input type="checkbox" checked={selected.includes(row.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,row.id]:old.filter(id=>id!==row.id))} aria-label={"Select "+row.email}/></td>{COLUMNS.map(([key,label])=><td key={key} onDragOver={e=>{if(key==="fresh_outreach_assigned_to"||key==="fresh_outreach_assigned_date")e.preventDefault()}} onDrop={e=>{if(key==="fresh_outreach_assigned_to"||key==="fresh_outreach_assigned_date"){e.preventDefault();dropFill(row.id,key)}}} className="border-b border-blue-50 px-3 py-2 align-top"><div className="flex min-w-36 items-center gap-1">{key==="fresh_outreach_assigned_to"?<><select value={row[key]||""} disabled={busy} onChange={e=>void fillAssignment([row.id],key,e.target.value)} onDragStart={()=>beginDrag(key,row[key]||"")} onDragEnd={()=>setDragFill(null)} draggable={Boolean(row[key])} onMouseDown={()=>{(window as any).__inventoryDragSource=row.id}} className="w-48 rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-xs"><option value="">Unassigned</option>{team.map(member=><option key={member.id} value={member.full_name}>{member.full_name}</option>)}</select><span title="Drag this cell to copy the selected member" draggable onDragStart={e=>{(window as any).__inventoryDragSource=row.id;beginDrag(key,row[key]||"");e.dataTransfer.effectAllowed="copy"}} className="cursor-grab text-slate-400"><GripVertical size={15}/></span></>:key==="fresh_outreach_assigned_date"?<><input type="date" value={row[key]||""} disabled={busy} onChange={e=>void fillAssignment([row.id],key,e.target.value)} onMouseDown={()=>{(window as any).__inventoryDragSource=row.id}} className="w-40 rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-xs"/><span title="Drag this cell to copy the exact date" draggable onDragStart={e=>{(window as any).__inventoryDragSource=row.id;beginDrag(key,row[key]||"");e.dataTransfer.effectAllowed="copy"}} className="cursor-grab text-slate-400"><GripVertical size={15}/></span></>:<span className="max-w-72 whitespace-normal break-words">{row[key]||"—"}</span>}</div></td>)}</tr>)}</tbody></table>{!visible.length&&<div className="p-10 text-center text-sm text-slate-500">No inventory leads found. Upload new leads to populate this sheet.</div>}</div>
      <div className="border-t border-blue-50 px-4 py-3 text-xs text-slate-500"><Users className="mr-1 inline" size={14}/>{visible.length} filtered leads shown · {selected.length} selected overall · Select all filtered adds every matching row without clearing earlier selections. Drag handles copy the same value to the rows between the source and target.</div>
    </section>
  </main>;
}