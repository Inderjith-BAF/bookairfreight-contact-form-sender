"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, FileUp, Loader2, Radar, Send, Sparkles, TriangleAlert, XCircle } from "lucide-react";
import { FreightVisual } from "./freight-visual";
import type { SenderDetails, SubmissionResult } from "@/types/submission";

const initial:SenderDetails={firstName:"",lastName:"",company:"",email:"",phone:"",subject:"",message:""};

export function SenderWorkspace(){
 const [urls,setUrls]=useState(""); const [details,setDetails]=useState(initial); const [results,setResults]=useState<SubmissionResult[]>([]);
 const [sending,setSending]=useState(false); const [dryRun,setDryRun]=useState(true); const [filter,setFilter]=useState<"all"|"success"|"captcha_required"|"unsupported"|"failed"|"submitted_unverified">("all");
 useEffect(()=>{try{const saved=localStorage.getItem("baf-sender-details");if(saved)setDetails({...initial,...JSON.parse(saved)})}catch{}},[]);
 useEffect(()=>{localStorage.setItem("baf-sender-details",JSON.stringify(details))},[details]);
 const update=(key:keyof SenderDetails,value:string)=>setDetails(p=>({...p,[key]:value}));
 const targetUrls=useMemo(()=>urls.split(/\r?\n|,/).map(v=>v.trim()).filter(Boolean),[urls]);
 async function importFile(file:File){const text=await file.text();const found=(text.match(/https?:\/\/[^\s,;"]+/g)||[]);setUrls(p=>[...p.split(/\r?\n|,/).map(v=>v.trim()).filter(Boolean),...found].filter((v,i,a)=>a.indexOf(v)===i).join("\n"))}
 async function run(){setSending(true);setResults([]);setFilter("all");try{const response=await fetch("/api/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({urls:targetUrls,details,dryRun})});const data=await response.json();setResults(data.results??[{url:"",status:"failed",message:data.error??"Request failed."}]);}catch{setResults([{url:"",status:"failed",message:"Could not connect to the application."}]);}finally{setSending(false)}}
 const counts=useMemo(()=>({all:results.length,success:results.filter(r=>r.status==="success").length,captcha_required:results.filter(r=>r.status==="captcha_required").length,unsupported:results.filter(r=>r.status==="unsupported").length,failed:results.filter(r=>r.status==="failed").length,submitted_unverified:results.filter(r=>r.status==="submitted_unverified").length}),[results]); const visibleResults=filter==="all"?results:results.filter(r=>r.status===filter);
 return <main className="min-h-screen bg-[#070b12]"><div className="pointer-events-none fixed inset-0 overflow-hidden"><div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-cyan-400/10 blur-[120px]"/><div className="absolute -right-40 top-80 h-96 w-96 rounded-full bg-lime-300/10 blur-[120px]"/></div>
 <div className="relative mx-auto max-w-7xl px-5 py-8 md:px-8 lg:py-12">
  <nav className="mb-12 flex items-center justify-between"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-lime-300 text-lg font-black text-slate-950">B</div><div><p className="font-black tracking-tight">BOOKAIRFREIGHT</p><p className="text-[10px] font-bold uppercase tracking-[.3em] text-slate-500">Outbound control room</p></div></div><div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[.03] px-4 py-2 text-xs text-slate-400 md:flex"><span className="h-2 w-2 animate-pulse rounded-full bg-lime-300"/> system ready</div></nav>
  <section className="mb-10 grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr]"><div><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 py-1.5 text-xs font-bold text-cyan-200"><Sparkles size={14}/> FREIGHT, BUT FASTER.</div><h1 className="max-w-3xl text-5xl font-black leading-[.96] tracking-[-.05em] md:text-7xl">One click.<br/><span className="text-lime-300">Forms shipped.</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-400 md:text-lg">Load your targets, load the payload, preview the route, then dispatch the batch.</p><div className="mt-7 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-widest text-slate-500">{["Air","Ocean","Road","Outbound"].map(x=><span key={x} className="rounded-full border border-white/10 px-3 py-2">{x}</span>)}</div></div><FreightVisual/></section>
  <div className="mb-10 overflow-hidden border-y border-white/5 py-3"><div className="marquee flex w-max gap-10 text-[11px] font-black uppercase tracking-[.35em] text-slate-600"><span>route planned ✦ form detected ✦ payload ready ✦ dispatch ✦ route planned ✦ form detected ✦ payload ready ✦ dispatch ✦</span><span>route planned ✦ form detected ✦ payload ready ✦ dispatch ✦ route planned ✦ form detected ✦ payload ready ✦ dispatch ✦</span></div></div>
  <section className="grid gap-5 lg:grid-cols-2">
   <div className="glass glow rounded-3xl p-5 md:p-7"><div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[.25em] text-cyan-300">01 / Targets</p><h2 className="mt-2 text-2xl font-black">Where are we shipping?</h2></div><Radar className="text-slate-600"/></div><textarea value={urls} onChange={e=>setUrls(e.target.value)} placeholder={"https://company.com/contact\nhttps://another-company.com/contact"} className="min-h-56 w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-200 outline-none focus:border-cyan-300/50"/><div className="mt-3 flex items-center justify-between text-xs text-slate-500"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"><FileUp size={14}/> Import TXT/CSV<input type="file" accept=".txt,.csv,text/plain,text/csv" className="hidden" onChange={e=>e.target.files?.[0]&&importFile(e.target.files[0])}/></label><span>{targetUrls.length}/25 targets</span></div></div>
   <div className="glass rounded-3xl p-5 md:p-7"><div className="mb-5"><p className="text-xs font-black uppercase tracking-[.25em] text-lime-300">02 / Payload</p><h2 className="mt-2 text-2xl font-black">Load your details.</h2></div><div className="grid gap-3 sm:grid-cols-2">{([["firstName","First name"],["lastName","Last name"],["company","Company"],["email","Email"],["phone","Phone"],["subject","Subject"]] as const).map(([key,label])=><label key={key} className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}<input value={details[key]} onChange={e=>update(key,e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-lime-300/50"/></label>)}<label className="text-xs font-bold uppercase tracking-wider text-slate-500 sm:col-span-2">Message<textarea value={details.message} onChange={e=>update("message",e.target.value)} className="mt-1.5 min-h-28 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-lime-300/50"/></label></div></div>
  </section>
  <section className="mt-5 flex flex-col gap-4 rounded-3xl border border-lime-300/20 bg-lime-300/[.04] p-5 md:flex-row md:items-center md:justify-between md:p-6"><div><div className="flex items-center gap-3"><p className="text-sm font-bold text-lime-100">{dryRun?"Preview mode":"Live dispatch"}</p><button onClick={()=>setDryRun(v=>!v)} className={"relative h-6 w-11 rounded-full transition "+(dryRun?"bg-cyan-300":"bg-lime-300")}><span className={"absolute top-1 h-4 w-4 rounded-full bg-slate-950 transition "+(dryRun?"left-1":"left-6")}/></button></div><p className="mt-1 text-sm text-slate-500">{dryRun?"Fills and maps forms without submitting. Use this first.":"Submits supported forms and records each result in Supabase."}</p></div><button disabled={sending||!targetUrls.length} onClick={run} className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-lime-300 px-7 py-4 font-black text-slate-950 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40">{sending?<><Loader2 className="animate-spin" size={18}/> {dryRun?"Scanning…":"Dispatching…"}</>:dryRun?<><Radar size={18}/> Preview targets <ArrowUpRight size={17}/></>:<><Send size={18}/> Send to all <ArrowUpRight size={17}/></>}</button></section>
  <section className="mt-8 glass rounded-3xl p-5 md:p-7">
   <div className="flex items-center justify-between">
    <div>
     <p className="text-xs font-black uppercase tracking-[.25em] text-slate-500">03 / Tracking</p>
     <h2 className="mt-2 text-2xl font-black">Shipment status</h2>
    </div>
    {results.length > 0 && <span className="text-xs font-bold text-slate-500">{results.length} processed</span>}
   </div>
   {results.length === 0 ? (
    <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-600">
     Run Preview first to see field mapping and target health.
    </div>
   ) : (
    <>
     <div className="mt-6 flex flex-wrap gap-2">
      {(["all","success","captcha_required","submitted_unverified","unsupported","failed"] as const).map(key => (
       <button key={key} onClick={() => setFilter(key)} className={"rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-wider " + (filter === key ? "border-lime-300/50 bg-lime-300/10 text-lime-200" : "border-white/10 text-slate-500")}>
        {key === "all" ? "All" : key === "captcha_required" ? "CAPTCHA queue" : key === "submitted_unverified" ? "Sent / unverified" : key.replace("_", " ")}
        <span className="ml-1 opacity-70">{counts[key]}</span>
       </button>
      ))}
     </div>
     <div className="mt-3 space-y-3">
      {visibleResults.map((r,i) => {
       const Icon = r.status === "success" || r.status === "submitted_unverified" ? CheckCircle2 : r.status === "captcha_required" ? TriangleAlert : r.status === "failed" ? XCircle : Radar;
       return (
        <div key={r.url + "-" + i} className="flex gap-4 rounded-2xl border border-white/10 bg-black/15 p-4">
         <Icon className={r.status === "success" ? "text-lime-300" : r.status === "submitted_unverified" ? "text-cyan-300" : r.status === "captcha_required" ? "text-amber-300" : "text-slate-500"} />
         <div className="min-w-0 flex-1">
          <div className="break-all text-sm font-semibold text-slate-200">{r.url}</div>
          <p className="mt-1 text-sm text-slate-500">{r.message}</p>
          {r.detectedFields?.length ? (
           <div className="mt-2 flex flex-wrap gap-1.5">
            {r.detectedFields.map(f => <span key={f} className="rounded-full bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">{f}</span>)}
           </div>
          ) : null}
         </div>
        </div>
       );
      })}
     </div>
    </>
   )}
  </section>
  <footer className="mt-10 pb-4 text-center text-xs text-slate-700">BOOKAIRFREIGHT • OUTBOUND CONTROL ROOM</footer>
 </div></main>;
}
