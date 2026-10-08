"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { BlueprintNav } from "@/components/blueprint-nav";
import { AnimatedNumber } from "@/components/animated-number";
import { CheckCircle2, ChevronLeft, ChevronRight, Plus, RefreshCw, Send, ShieldCheck, Upload } from "lucide-react";
import * as XLSX from "xlsx";

type Account={id:string;email:string;health_status:string;daily_send_limit:number;hourly_send_limit:number;total_sent:number;employee_id?:string;provider?:string|null;connection_status?:string;connection_error?:string|null;last_verified_at?:string|null};
type Lead={id:string;email:string;company_name:string;first_name:string;last_name:string;country:string;current_status:string;suppression_reason:string|null};
type Campaign={id:string;name:string;country:string;campaign_group:string;subject:string;body:string;status:string};
type Block={batchId:string;accountId:string;leadIds:string[];subject:string;body:string};

const groups=["Fresh Outreach","Follow-up 1","Follow-up 2","Follow-up 3","Custom"];
const blockedStatuses=["Bounced","Unsubscribed","Suppressed","Positive","Neutral","Negative"];

export default function MailMergePage(){
 const supabase=useMemo(()=>getSupabaseBrowser(),[]);
 const [token,setToken]=useState("");
 const [authLoading,setAuthLoading]=useState(true);
 const [authEmail,setAuthEmail]=useState("");
 const [authPassword,setAuthPassword]=useState("");
 const [stage,setStage]=useState(1);
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [leads,setLeads]=useState<Lead[]>([]);
 const [selected,setSelected]=useState<string[]>([]);
 const [selectedAccounts,setSelectedAccounts]=useState<string[]>([]);
 const [volumes,setVolumes]=useState<Record<string,number>>({});
 const [campaignId,setCampaignId]=useState("");
 const [followupSource,setFollowupSource]=useState("");
 const [followupSubjects,setFollowupSubjects]=useState<Record<string,string>>({});
 const [sourceMode,setSourceMode]=useState<"fresh"|"followup">("fresh");
 const [blocks,setBlocks]=useState<Block[]>([]);
 const [savedBlocks,setSavedBlocks]=useState(false);
 const [busy,setBusy]=useState(false);
 const [msg,setMsg]=useState("");
 const [err,setErr]=useState("");
 const [q,setQ]=useState("");
 const [uploading,setUploading]=useState(false);
 const [paste,setPaste]=useState("");
 const [form,setForm]=useState({name:"",country:"USA",campaign_group:"Fresh Outreach"});
 const [addAccountOpen,setAddAccountOpen]=useState(false);
 const [connectionBusy,setConnectionBusy]=useState<"google"|"microsoft"|null>(null);

 const api=useCallback(async(path:string,options?:RequestInit)=>{
  const r=await fetch(path,{...options,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",...(options?.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"Request failed");
  return d;
 },[token]);

 const load=useCallback(async()=>{
  if(!token)return;
  const d=await api("/api/mail-merge");
  setCampaigns(d.campaigns||[]);
  setAccounts(d.accounts||[]);
  setSelectedAccounts(prev=>prev);
 },[api,token]);

 const loadFreshLeads=useCallback(async()=>{
  const d=await api("/api/leads?country="+encodeURIComponent(form.country)+"&page=1&pageSize=1000");
  const eligible=(d.leads||[]).filter((x:Lead)=>!x.suppression_reason&&!blockedStatuses.includes(x.current_status));
  setLeads(eligible);
  return eligible;
 },[api,form.country]);

 const loadFollowup=useCallback(async(id:string)=>{
  if(!id)return;
  const d=await api("/api/mail-merge?id="+encodeURIComponent(id));
  const recipients=(d.recipients||[]).filter((r:any)=>r.master_leads);
  const rows=recipients.map((r:any)=>r.master_leads).filter(Boolean);
  const eligible=rows.filter((x:Lead)=>!x.suppression_reason&&!blockedStatuses.includes(x.current_status));
  const subjects:Record<string,string>={};
  for(const r of recipients){
   if(r.master_leads?.id&&typeof r.subject==="string")subjects[r.master_leads.id]=r.subject;
  }
  setFollowupSubjects(subjects);
  setLeads(eligible);
 },[api]);

 useEffect(()=>{let mounted=true;(async()=>{const {data}=await supabase.auth.getSession();if(!mounted)return;setToken(data.session?.access_token||"");setAuthLoading(false)})();const {data}=supabase.auth.onAuthStateChange((_event,session)=>{setToken(session?.access_token||"");setAuthLoading(false)});const p=new URLSearchParams(window.location.search);if(p.get("connection")==="success"){setMsg((p.get("email")||"Mailbox")+" connected successfully. It is now available for outreach.");window.history.replaceState({},document.title,window.location.pathname)}return()=>{mounted=false;data.subscription.unsubscribe()}},[supabase]);
 useEffect(()=>{if(token)load().catch(e=>setErr(e.message))},[token,load]);

 async function signIn(){setErr("");const {data,error}=await supabase.auth.signInWithPassword({email:authEmail,password:authPassword});if(error){setErr(error.message);return}setToken(data.session?.access_token||"")}
 const required=selectedAccounts.reduce((n,id)=>n+Math.min(100,Math.max(1,Number(volumes[id]||10))),0);
 const remaining=required-selected.length;
 const selectedByAccount=useMemo(()=>{
  let cursor=0;
  return selectedAccounts.map(id=>{const count=Math.min(100,Math.max(1,Number(volumes[id]||10)));const ids=selected.slice(cursor,cursor+count);cursor+=ids.length;return {accountId:id,leadIds:ids}});
 },[selected,selectedAccounts,volumes]);

 function toggleAccount(id:string){
  const account=accounts.find(a=>a.id===id);
  if(account?.connection_status!=="Connected"){setErr("Connect this mailbox before selecting it for outreach.");return;}
  setSelectedAccounts(prev=>{
   if(prev.includes(id))return prev.filter(x=>x!==id);
   return [...prev,id];
  });
 }
 function setVolume(id:string,value:number){
  setVolumes(v=>({...v,[id]:Math.min(100,Math.max(1,Number.isFinite(value)?value:1))}));
 }
 async function connectProvider(provider:"google"|"microsoft"){
  setConnectionBusy(provider);setErr("");setMsg("");
  try{
   const d=await api("/api/mail-merge/oauth/start",{method:"POST",body:JSON.stringify({provider})});
   window.location.href=d.url;
  }catch(e){setErr(e instanceof Error?e.message:"Could not start mailbox connection.");setConnectionBusy(null)}
 }
 async function createDraft(){
  setBusy(true);setErr("");setMsg("");
  try{
   if(!form.name.trim())throw new Error("Campaign name is required.");
   if(!form.country.trim())throw new Error("Country is required.");
   if(!selectedAccounts.length)throw new Error("Select at least one email account.");
   const d=await api("/api/mail-merge",{method:"POST",body:JSON.stringify(form)});
   setCampaignId(d.campaign.id);
   setCampaigns(x=>[d.campaign,...x.filter(c=>c.id!==d.campaign.id)]);
   await loadFreshLeads();
   setStage(2);
  }catch(e){setErr(e instanceof Error?e.message:"Could not create campaign draft.")}finally{setBusy(false)}
 }
 async function importLeadGrid(grid:unknown[][],sourceName:string){
  setUploading(true);setErr("");setMsg("");
  try{
   if(grid.length<2)throw new Error("Paste a header row followed by at least one lead row.");
   const headers=(grid[0]||[]).map(v=>String(v??"").trim());
   const rows=grid.slice(1).filter(r=>(r as unknown[]).some(v=>String(v??"").trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,String((r as unknown[])[i]??"")])));
   if(!rows.length)throw new Error("No lead rows were found.");
   const d=await api("/api/leads",{method:"POST",body:JSON.stringify({rows,fileName:sourceName})});
   const resolved=(d.resolved_leads||d.added_leads||[]) as Lead[];
   const eligible=resolved.filter((x:Lead)=>!x.suppression_reason&&!blockedStatuses.includes(x.current_status));
   setLeads(eligible);
   if(sourceMode==="fresh"&&eligible.length){
    const chosen=eligible.slice(0,required).map((x:Lead)=>x.id);
    setSelected(chosen);
    setMsg(`Lead import complete · ${d.added_count||0} added · ${d.skipped_existing||0} existing/skipped. ${chosen.length} of ${required} leads selected.`);
   } else {
    setMsg(`Lead import complete · ${d.added_count||0} added · ${d.skipped_existing||0} existing/skipped.`);
   }
   setPaste("");
  }catch(e){setErr(e instanceof Error?e.message:"Lead import failed.")}finally{setUploading(false)}
 }
 async function uploadLeads(file:File){
  const buffer=await file.arrayBuffer();
  const wb=XLSX.read(buffer,{type:"array"});
  const grid=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
  await importLeadGrid(grid,file.name);
 }
 async function pasteLeads(){
  if(!paste.trim())return;
  const wb=XLSX.read(paste,{type:"string"});
  const grid=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
  await importLeadGrid(grid,"Clipboard paste");
 }
 async function saveMessageBlocks(){
  if(!campaignId)return;
  if(blocks.some(b=>!b.subject.trim()||!b.body.trim()))throw new Error("Every message block needs a subject and content.");
  setBusy(true);setErr("");setMsg("");
  try{
   if(blocks[0])await api("/api/mail-merge",{method:"PATCH",body:JSON.stringify({id:campaignId,subject:blocks[0].subject,body:blocks[0].body})});
   for(const b of blocks){
    if(b.leadIds.length)await api("/api/mail-merge/recipients",{method:"POST",body:JSON.stringify({campaignId,leadIds:b.leadIds,senderAccountId:b.accountId,batchId:b.batchId,subjectOverride:b.subject,bodyOverride:b.body})});
   }
   setSavedBlocks(true);
   setMsg("Campaign messages and recipient batches saved.");
   setStage(4);
   await load();
  }catch(e){setErr(e instanceof Error?e.message:"Could not save campaign messages.")}finally{setBusy(false)}
 }
 async function queue(){
  setBusy(true);setErr("");try{const d=await api("/api/mail-merge/queue",{method:"POST",body:JSON.stringify({campaignId})});setMsg(d.message);await load()}catch(e){setErr(e instanceof Error?e.message:"Queue failed")}finally{setBusy(false)}
 }
 async function syncReplies(){setBusy(true);setErr("");try{const d=await api("/api/mail-merge/sync-replies",{method:"POST"});setMsg(d.message);await load()}catch(e){setErr(e instanceof Error?e.message:"Reply sync failed")}finally{setBusy(false)}}
 async function send(){
  setBusy(true);setErr("");try{const d=await api("/api/mail-merge/send",{method:"POST",body:JSON.stringify({campaignId})});setMsg(`Dispatch complete · ${d.sent} sent · ${d.failed} failed.`);await load()}catch(e){setErr(e instanceof Error?e.message:"Dispatch failed")}finally{setBusy(false)}
 }
 function nextFromStage2(){
  if(selected.length<required){setErr(`Select/upload at least ${required} eligible leads for the selected account volume. You currently have ${selected.length}.`);return}
  const alloc=selectedByAccount;
  const nextBlocks:Block[]=[];
  for(const a of alloc){
   if(sourceMode==="followup"){
    const bySubject=new Map<string,string[]>();
    for(const leadId of a.leadIds){
     const subject=followupSubjects[leadId]||"";
     const ids=bySubject.get(subject)||[];
     ids.push(leadId);
     bySubject.set(subject,ids);
    }
    for(const [subject,ids] of bySubject){
     for(let i=0;i<ids.length;i+=10){
      nextBlocks.push({batchId:crypto.randomUUID(),accountId:a.accountId,leadIds:ids.slice(i,i+10),subject,body:""});
     }
    }
   }else{
    for(let i=0;i<a.leadIds.length;i+=10){
     nextBlocks.push({batchId:crypto.randomUUID(),accountId:a.accountId,leadIds:a.leadIds.slice(i,i+10),subject:"",body:""});
    }
   }
  }
  setBlocks(nextBlocks);
  setErr("");setStage(3);
 }
 const active=campaigns.find(c=>c.id===campaignId);
 const accountName=(id:string)=>accounts.find(a=>a.id===id)?.email||"Unknown account";

 if(authLoading)return <main className="min-h-screen grid place-items-center bg-slate-50 p-6"><div className="text-sm font-semibold text-slate-500">Checking your outbound session…</div></main>;
 if(!token)return <main className="min-h-screen grid place-items-center bg-slate-50 p-6 text-slate-900"><div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl"><div className="text-xs font-black uppercase tracking-[.25em] text-indigo-600">BookAirfreight</div><h1 className="mt-2 text-3xl font-black">Sign in to Mail Merge</h1><p className="mt-2 text-sm text-slate-500">Use your individual outbound team credentials to connect and send from a mailbox.</p><div className="mt-6 space-y-3"><input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="Work email" type="email" className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"/><input value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder="Password" type="password" onKeyDown={e=>{if(e.key==="Enter")signIn()}} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"/>{err&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{err}</div>}<button onClick={signIn} className="w-full rounded-2xl bg-indigo-600 py-3 font-bold text-white">Sign in →</button></div></div></main>;

 return <main className="os-page-enter min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 text-slate-900">
  <div className="mx-auto max-w-[1500px] p-4 md:p-8">
   <header className="mb-5 flex items-center justify-between rounded-3xl border border-blue-100 bg-white/90 p-6 shadow-sm">
    <div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-indigo-500"><ShieldCheck size={15}/> BookAirfreight · Campaign Operations</div><h1 className="mt-2 text-3xl font-black">Mail Merge</h1><p className="mt-1 text-sm text-slate-500">One controlled stage at a time — accounts → leads → campaign messages → dispatch.</p></div>
    <button onClick={()=>load()} className="rounded-xl border border-blue-100 p-3 text-indigo-600">{busy?<RefreshCw className="animate-spin" size={18}/>:<RefreshCw size={18}/>}</button>
   </header>
   <BlueprintNav/>
   {(msg||err)&&<div className={`mb-5 rounded-2xl border p-4 text-sm ${err?"border-rose-100 bg-rose-50 text-rose-700":"border-emerald-100 bg-emerald-50 text-emerald-700"}`}>{err||msg}</div>}

   <div className="os-stagger mb-3 grid grid-cols-4 gap-2">{["Email Accounts","Leads","Campaign Builder","Review & Dispatch"].map((x,i)=><div key={x} className={`os-card rounded-2xl border p-4 text-center text-xs font-black ${stage===i+1?"border-indigo-300 bg-indigo-50 text-indigo-700 shadow-md shadow-indigo-100":"border-blue-100 bg-white text-slate-400"}`}><span className={`mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-white shadow-sm ${stage===i+1?"os-health-dot":""}`}>{stage>i+1?<CheckCircle2 size={15}/>:i+1}</span>{x}</div>)}</div><div className="os-progress-track mb-6 h-1.5 rounded-full bg-blue-100"><div className="os-progress-fill h-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-violet-500" style={{width:`${stage*25}%`}}/></div>

   {stage===1&&<section className="mx-auto max-w-6xl space-y-5 stagger">
    <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
     <div className="flex items-center justify-between"><div><h2 className="text-xl font-black">1. Select outreach email accounts</h2><p className="mt-1 text-sm text-slate-500">Choose the accounts for this campaign. Set the outreach volume per account; backend limits remain enforced.</p></div><button onClick={()=>{setErr("");setAddAccountOpen(true)}} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:-translate-y-1 hover:shadow-indigo-300"><Plus size={16} className="mr-1 inline"/>Connect email account</button></div>
     <div className="mt-5 grid gap-4 md:grid-cols-2">{accounts.map(a=>{const checked=selectedAccounts.includes(a.id);const connected=a.connection_status==="Connected";const remaining=Math.max(0,Math.min(Number(a.daily_send_limit||0),Number(a.hourly_send_limit||0)));return <div key={a.id} className={`os-card lift rounded-2xl border p-5 transition-all duration-300 ${checked?"border-indigo-300 bg-indigo-50/40 ring-1 ring-indigo-200 shadow-lg shadow-indigo-100":"border-blue-100 bg-white"}`}><div className="flex items-start justify-between gap-3"><label className="flex items-center gap-3"><input type="checkbox" checked={checked} disabled={!connected} onChange={()=>toggleAccount(a.id)} className="h-5 w-5"/><div><div className="font-black">{a.email}</div><div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><span>{a.health_status} · {a.total_sent||0} sent</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${connected?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{connected?"Connected":"Needs connection"}</span></div></div></label><span className={`rounded-full px-3 py-1 text-[10px] font-black ${connected?"bg-white text-slate-500":"bg-amber-50 text-amber-700"}`}>{connected?"Backend remaining ≥ "+remaining:"Connect to enable sending"}</span></div>{checked&&<div className="mt-5"><div className="flex items-center justify-between text-xs font-bold"><span>Outreach volume for this campaign</span><span className="text-indigo-600">{volumes[a.id]||10} / 100</span></div><input type="range" min="1" max="100" value={volumes[a.id]||10} onChange={e=>setVolume(a.id,Number(e.target.value))} className="mt-3 w-full"/><p className="mt-2 text-[11px] text-slate-500">This is your campaign allocation only. You can allocate multiple 10-recipient message blocks; daily/hourly/provider limits are still enforced by the backend.</p></div>}</div>})}</div>
    </div>
    <div className="os-card rounded-3xl border border-blue-100 bg-white p-6 shadow-sm"><h2 className="font-black">Campaign setup</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Campaign name" className="rounded-xl border border-blue-100 p-3"/><input value={form.country} onChange={e=>setForm({...form,country:e.target.value})} placeholder="Country" className="rounded-xl border border-blue-100 p-3"/><select value={form.campaign_group} onChange={e=>setForm({...form,campaign_group:e.target.value})} className="rounded-xl border border-blue-100 p-3">{groups.map(g=><option key={g}>{g}</option>)}</select></div><div className="mt-5 flex justify-end"><button onClick={createDraft} disabled={busy} className="rounded-xl bg-indigo-600 px-6 py-3 font-bold text-white disabled:opacity-40">Continue to Leads <ChevronRight size={16} className="ml-1 inline"/></button></div></div>
   </section>}

   {stage===2&&<section className="mx-auto max-w-7xl space-y-5 stagger">
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
     <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">2. Upload or select leads</h2><p className="mt-1 text-sm text-slate-500">You need <b>{required}</b> eligible leads for the selected account allocation. You can paste directly from Excel / Google Sheets or upload a file.</p></div><label className="cursor-pointer rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700"><Upload size={16} className="mr-1 inline"/>{uploading?"Importing…":"Upload CSV / Excel"}<input type="file" accept=".csv,.xlsx,.xls" className="hidden" disabled={uploading} onChange={e=>{const f=e.target.files?.[0];if(f)uploadLeads(f)}}/></label></div>
      <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4"><div className="text-sm font-black text-slate-700">Paste from Excel / Google Sheets</div><p className="mt-1 text-xs text-slate-500">Copy the header row and lead rows from your spreadsheet, then paste them below. The same Master Lead Sheet validation, duplicate protection and reconciliation rules apply.</p><textarea value={paste} onChange={e=>setPaste(e.target.value)} placeholder="Paste your header row and lead rows here…" className="mt-3 min-h-32 w-full resize-y rounded-xl border border-blue-100 bg-white p-3 font-mono text-xs leading-6 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"/><div className="mt-3 flex items-center justify-between gap-3"><span className="text-[11px] text-slate-400">{paste.trim()?paste.trim().split(/\r?\n/).length+" pasted lines":"Waiting for spreadsheet data"}</span><button onClick={pasteLeads} disabled={uploading||!paste.trim()} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">{uploading?"Importing…":"Validate & Add Leads"}</button></div></div>
      <div className="mt-5 flex gap-2 rounded-2xl bg-slate-50 p-2"><button onClick={()=>{setSourceMode("fresh");setFollowupSubjects({});setForm(f=>({...f,campaign_group:"Fresh Outreach"}));loadFreshLeads()}} className={`flex-1 rounded-xl p-3 text-sm font-bold ${sourceMode==="fresh"?"bg-white shadow text-indigo-700":"text-slate-500"}`}>Fresh eligible leads</button><button onClick={()=>{setSourceMode("followup");setForm(f=>({...f,campaign_group:"Follow-up 1"}))}} className={`flex-1 rounded-xl p-3 text-sm font-bold ${sourceMode==="followup"?"bg-white shadow text-indigo-700":"text-slate-500"}`}>Follow-up from campaign</button></div>
      {sourceMode==="followup"&&<select value={followupSource} onChange={e=>{setFollowupSource(e.target.value);loadFollowup(e.target.value)}} className="mt-4 w-full rounded-xl border border-blue-100 p-3"><option value="">Select previous campaign</option>{campaigns.filter(c=>c.id!==campaignId).map(c=><option key={c.id} value={c.id}>{c.name} · {c.country} · {c.campaign_group}</option>)}</select>}
      <div className="mt-4 flex gap-3"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search email, company or person" className="flex-1 rounded-xl border border-blue-100 p-3"/><button onClick={sourceMode==="fresh"?loadFreshLeads:()=>loadFollowup(followupSource)} className="rounded-xl border border-blue-100 px-4 font-bold text-indigo-600">Refresh</button></div>
      <div className="mt-4 max-h-[430px] overflow-auto rounded-2xl border border-blue-50"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-blue-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Select</th><th className="p-3">Recipient</th><th className="p-3">Company</th><th className="p-3">Country</th><th className="p-3">Status</th></tr></thead><tbody>{leads.filter(l=>!q||`${l.email} ${l.company_name} ${l.first_name} ${l.last_name}`.toLowerCase().includes(q.toLowerCase())).map(l=><tr key={l.id} className="border-t border-blue-50 hover:bg-blue-50/50"><td className="p-3"><input type="checkbox" checked={selected.includes(l.id)} disabled={!selected.includes(l.id)&&selected.length>=required} onChange={e=>setSelected(s=>e.target.checked?[...s,l.id]:s.filter(x=>x!==l.id))}/></td><td className="p-3"><b>{l.first_name} {l.last_name}</b><div className="text-xs text-indigo-600">{l.email}</div></td><td className="p-3">{l.company_name||"—"}</td><td className="p-3">{l.country}</td><td className="p-3 text-xs">{l.current_status}</td></tr>)}</tbody></table></div>
     </div>
     <aside className="space-y-5"><div className="os-card rounded-3xl border border-blue-100 bg-white p-6 shadow-sm"><h3 className="font-black">Lead requirement</h3><div className="mt-4 text-4xl font-black text-indigo-600 os-number"><AnimatedNumber value={selected.length}/><span className="text-lg text-slate-400"> / {required}</span></div><p className="mt-2 text-sm text-slate-500">{remaining>0?`${remaining} more eligible leads required.`:"Requirement met. Ready for campaign builder."}</p><div className="mt-4 space-y-2">{selectedAccounts.map(id=><div key={id} className="flex justify-between rounded-xl bg-slate-50 p-3 text-xs"><span>{accountName(id)}</span><b>{Math.min(100,Math.max(1,Number(volumes[id]||10)))} recipients</b></div>)}</div></div><button onClick={()=>{setStage(1);setErr("")}} className="w-full rounded-xl border border-blue-100 p-3 font-bold"><ChevronLeft size={16} className="mr-1 inline"/>Back</button><button onClick={nextFromStage2} disabled={selected.length<required} className="w-full rounded-xl bg-indigo-600 p-3 font-bold text-white disabled:opacity-40">Continue to Campaign Builder <ChevronRight size={16} className="ml-1 inline"/></button></aside>
    </div>
   </section>}

   {stage===3&&<section className="mx-auto max-w-6xl space-y-5 stagger">
    <div className="os-card rounded-3xl border border-blue-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">3. Campaign Builder</h2><p className="mt-1 text-sm text-slate-500">Each account can have multiple message blocks. Every subject + content block is limited to 10 recipients. Follow-ups inherit the previous subject line for each recipient batch and remain editable.</p></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">{blocks.length} message blocks · {selected.length} recipients</span></div>
    <div className="mt-5 space-y-5">{blocks.map((b,i)=><div key={b.batchId} className="os-card os-row-enter rounded-3xl border border-blue-100 bg-slate-50 p-5" style={{animationDelay:`${i*70}ms`}}><div className="flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-indigo-500">Message Block {i+1} · Batch of 10 max</div><div className="mt-1 font-black">{accountName(b.accountId)}</div></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold">{b.leadIds.length}/10 recipients</span></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div><label className="text-xs font-black text-slate-500">Subject {sourceMode==="followup"&&<span className="font-normal text-emerald-600">· inherited from previous campaign</span>}</label><input value={b.subject} onChange={e=>setBlocks(bs=>bs.map((x,j)=>j===i?{...x,subject:e.target.value}:x))} placeholder="Subject line" className="mt-2 w-full rounded-xl border border-blue-100 bg-white p-3"/><div className="mt-2 text-[11px] text-slate-400">{sourceMode==="followup"?"The previous campaign subject is pre-filled for this recipient batch. Edit it if needed.":"Exactly this batch of up to 10 recipients uses this subject/content. Multiple batches can use the same sending account."}</div></div><div><label className="text-xs font-black text-slate-500">Email content</label><textarea value={b.body} onChange={e=>setBlocks(bs=>bs.map((x,j)=>j===i?{...x,body:e.target.value}:x))} placeholder="Write the email content. Use {{first_name}}, {{company_name}}, {{last_name}}, {{email}}." className="mt-2 min-h-40 w-full rounded-xl border border-blue-100 bg-white p-3 leading-6"/></div></div><div className="mt-4 rounded-2xl bg-white p-4"><div className="text-xs font-black uppercase text-slate-400">Recipients in this block</div><div className="mt-2 flex flex-wrap gap-2">{b.leadIds.map(id=>{const l=leads.find(x=>x.id===id);return <span key={id} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{l?.email||id}</span>})}</div></div></div>)}</div>
    <div className="mt-5 flex justify-between"><button onClick={()=>setStage(2)} className="rounded-xl border border-blue-100 px-5 py-3 font-bold"><ChevronLeft size={16} className="mr-1 inline"/>Back</button><button onClick={saveMessageBlocks} disabled={busy||blocks.some(b=>!b.subject.trim()||!b.body.trim())} className="rounded-xl bg-indigo-600 px-6 py-3 font-bold text-white disabled:opacity-40">Save & Review <ChevronRight size={16} className="ml-1 inline"/></button></div>
    </div>
   </section>}

   {stage===4&&<section className="mx-auto max-w-6xl space-y-5 stagger">
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
     <div className="os-card rounded-3xl border border-blue-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">4. Review & Dispatch</h2><p className="mt-1 text-sm text-slate-500">{active?.name} · {active?.country} · {active?.campaign_group}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{savedBlocks?"Ready for review":"Draft"}</span></div><div className="mt-5 space-y-4">{blocks.map((b,i)=><div key={b.batchId} className="rounded-2xl border border-blue-100 p-4"><div className="flex justify-between"><b>{accountName(b.accountId)}</b><span className="text-xs font-bold text-slate-500">{b.leadIds.length}/10</span></div><div className="mt-3 font-bold">{b.subject}</div><div className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{b.body}</div></div>)}</div></div>
     <aside className="space-y-5"><div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm"><h3 className="font-black">Safety controls</h3><div className="mt-4 space-y-2 text-sm"><div className="flex justify-between rounded-xl bg-emerald-50 p-3"><span>Recipients / message block</span><b>10 max</b></div><div className="flex justify-between rounded-xl bg-emerald-50 p-3"><span>Blocks / sending account</span><b>Multiple</b></div><div className="flex justify-between rounded-xl bg-emerald-50 p-3"><span>Backend daily/hourly cap</span><b>Enforced</b></div><div className="flex justify-between rounded-xl bg-emerald-50 p-3"><span>Suppression recheck</span><b>Before queue/send</b></div></div></div><div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm"><button onClick={queue} disabled={busy} className="w-full rounded-xl bg-indigo-600 p-3 font-bold text-white disabled:opacity-40">Queue campaign</button><button onClick={send} disabled={busy} className="os-interactive mt-3 w-full rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:opacity-40"><Send size={16} className="mr-1 inline"/>Dispatch</button><button onClick={syncReplies} disabled={busy} className="os-interactive mt-3 w-full rounded-xl border border-indigo-200 bg-indigo-50 p-3 font-bold text-indigo-700 disabled:opacity-40">Sync replies</button><button onClick={()=>setStage(3)} className="mt-3 w-full rounded-xl border border-blue-100 p-3 font-bold">Back to Builder</button></div></aside>
    </div>
   </section>}
  {addAccountOpen&&<div className="add-account-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-account-title" onMouseDown={e=>{if(e.target===e.currentTarget)setAddAccountOpen(false)}}>
   <div className="add-account-panel shimmer" onMouseDown={e=>e.stopPropagation()}>
    <div className="flex items-start justify-between gap-4">
     <div>
      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-[.18em] text-indigo-600"><ShieldCheck size={13}/> Secure mailbox connection</div>
      <h2 id="add-account-title" className="text-2xl font-black">Connect an email account</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Authenticate the real mailbox you want BookAirfreight OS to send from. An email address alone is never treated as a connected sending account.</p>
     </div>
     <button type="button" onClick={()=>setAddAccountOpen(false)} className="rounded-full border border-blue-100 bg-white p-2 text-slate-500 transition hover:rotate-90" aria-label="Close">×</button>
    </div>
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={()=>connectProvider("google")} disabled={!!connectionBusy} className="os-interactive rounded-2xl border border-blue-100 bg-white p-5 text-left shadow-sm disabled:opacity-50"><div className="text-sm font-black">Google Workspace</div><div className="mt-1 text-xs leading-5 text-slate-500">Connect Gmail with OAuth for sending and reply tracking.</div><div className="mt-4 text-xs font-black text-indigo-600">{connectionBusy==="google"?"Redirecting…":"Connect Google →"}</div></button>
      <button type="button" onClick={()=>connectProvider("microsoft")} disabled={!!connectionBusy} className="os-interactive rounded-2xl border border-blue-100 bg-white p-5 text-left shadow-sm disabled:opacity-50"><div className="text-sm font-black">Microsoft 365</div><div className="mt-1 text-xs leading-5 text-slate-500">Connect Outlook / Microsoft 365 with OAuth for sending and reply tracking.</div><div className="mt-4 text-xs font-black text-indigo-600">{connectionBusy==="microsoft"?"Redirecting…":"Connect Microsoft →"}</div></button>
    </div>
    <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs leading-5 text-amber-800"><b>Security:</b> mailbox credentials are never stored in the browser. OAuth tokens are encrypted server-side.</div>
    <div className="mt-6 flex justify-end"><button type="button" onClick={()=>setAddAccountOpen(false)} className="rounded-xl border border-blue-100 bg-white px-5 py-3 text-sm font-bold text-slate-600">Cancel</button></div>
   </div>
  </div>}
  </div>
 </main>
}