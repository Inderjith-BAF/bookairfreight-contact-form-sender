"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle2, Loader2, Radar, Send, Sparkles, TriangleAlert, XCircle } from "lucide-react";
import { FreightVisual } from "./freight-visual";
import type { SenderDetails, SubmissionResult } from "@/types/submission";

const initial: SenderDetails = { name:"", company:"", email:"", phone:"", subject:"", message:"" };

export function SenderWorkspace() {
  const [urls,setUrls]=useState("");
  const [details,setDetails]=useState(initial);
  const [results,setResults]=useState<SubmissionResult[]>([]);
  const [sending,setSending]=useState(false);
  const update=(key:keyof SenderDetails,value:string)=>setDetails(prev=>({...prev,[key]:value}));
  async function send(){
    const parsedUrls=urls.split(/\r?\n|,/).map(v=>v.trim()).filter(Boolean);
    setSending(true); setResults([]);
    try {
      const response=await fetch("/api/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({urls:parsedUrls,details})});
      const data=await response.json();
      setResults(data.results ?? [{url:"",status:"failed",message:data.error ?? "Request failed."}]);
    } catch { setResults([{url:"",status:"failed",message:"Could not connect to the application."}]); }
    finally { setSending(false); }
  }
  const count=urls.split(/\r?\n|,/).map(v=>v.trim()).filter(Boolean).length;
  return <main className="min-h-screen bg-[#070b12]">
    <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-cyan-400/10 blur-[120px]"/><div className="absolute -right-40 top-80 h-96 w-96 rounded-full bg-lime-300/10 blur-[120px]"/></div>
    <div className="relative mx-auto max-w-7xl px-5 py-8 md:px-8 lg:py-12">
      <nav className="mb-12 flex items-center justify-between"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-lime-300 text-lg font-black text-slate-950">B</div><div><p className="font-black tracking-tight">BOOKAIRFREIGHT</p><p className="text-[10px] font-bold uppercase tracking-[.3em] text-slate-500">Outbound control room</p></div></div><div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[.03] px-4 py-2 text-xs text-slate-400 md:flex"><span className="pulse-dot h-2 w-2 rounded-full bg-lime-300"/> system ready</div></nav>
      <section className="mb-10 grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
        <div><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 py-1.5 text-xs font-bold text-cyan-200"><Sparkles size={14}/> FREIGHT, BUT FASTER.</div><h1 className="max-w-3xl text-5xl font-black leading-[.96] tracking-[-.05em] md:text-7xl">One click.<br/><span className="text-lime-300">Forms shipped.</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-400 md:text-lg">Drop your target contact forms, load the sender profile, and let the outbound engine handle the repetitive work.</p><div className="mt-7 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-widest text-slate-500">{["Air","Ocean","Road","Outbound"].map(x=><span key={x} className="rounded-full border border-white/10 px-3 py-2">{x}</span>)}</div></div>
        <FreightVisual/>
      </section>
      <div className="mb-10 overflow-hidden border-y border-white/5 py-3"><div className="marquee flex w-max gap-10 text-[11px] font-black uppercase tracking-[.35em] text-slate-600"><span>route planned ✦ form detected ✦ payload ready ✦ dispatch ✦ route planned ✦ form detected ✦ payload ready ✦ dispatch ✦</span><span>route planned ✦ form detected ✦ payload ready ✦ dispatch ✦ route planned ✦ form detected ✦ payload ready ✦ dispatch ✦</span></div></div>
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="glass glow rounded-3xl p-5 md:p-7"><div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[.25em] text-cyan-300">01 / Targets</p><h2 className="mt-2 text-2xl font-black">Where are we shipping?</h2></div><Radar className="text-slate-600"/></div><textarea value={urls} onChange={e=>setUrls(e.target.value)} placeholder={"https://company.com/contact\nhttps://another-company.com/contact"} className="min-h-64 w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-200 outline-none focus:border-cyan-300/50"/><div className="mt-3 flex justify-between text-xs text-slate-500"><span>One URL per line</span><span>{count} {count===1?"target":"targets"}</span></div></div>
        <div className="glass rounded-3xl p-5 md:p-7"><div className="mb-5"><p className="text-xs font-black uppercase tracking-[.25em] text-lime-300">02 / Payload</p><h2 className="mt-2 text-2xl font-black">Load your details.</h2></div><div className="grid gap-3 sm:grid-cols-2">{([["name","Name"],["company","Company"],["email","Email"],["phone","Phone"],["subject","Subject"]] as const).map(([key,label])=><label key={key} className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}<input value={details[key]} onChange={e=>update(key,e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-lime-300/50"/></label>)}<label className="text-xs font-bold uppercase tracking-wider text-slate-500 sm:col-span-2">Message<textarea value={details.message} onChange={e=>update("message",e.target.value)} className="mt-1.5 min-h-28 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-lime-300/50"/></label></div></div>
      </section>
      <section className="mt-5 flex flex-col gap-4 rounded-3xl border border-lime-300/20 bg-lime-300/[.04] p-5 md:flex-row md:items-center md:justify-between md:p-6"><div><p className="text-sm font-bold text-lime-100">Ready for dispatch?</p><p className="mt-1 text-sm text-slate-500">Standard forms can be submitted automatically. Anti-bot challenges are flagged for manual handling.</p></div><button disabled={sending||!urls.trim()} onClick={send} className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-lime-300 px-7 py-4 font-black text-slate-950 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40">{sending?<><Loader2 className="animate-spin" size={18}/> Dispatching…</>:<><Send size={18}/> Send to all <ArrowUpRight size={17}/></>}</button></section>
      <section className="mt-8 glass rounded-3xl p-5 md:p-7"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.25em] text-slate-500">03 / Tracking</p><h2 className="mt-2 text-2xl font-black">Shipment status</h2></div>{results.length>0&&<span className="text-xs font-bold text-slate-500">{results.length} processed</span>}</div>{results.length===0?<div className="mt-6 rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-600">Your dispatch results will appear here.</div>:<div className="mt-6 space-y-3">{results.map((r,i)=>{const Icon=r.status==="success"?CheckCircle2:r.status==="captcha_required"?TriangleAlert:r.status==="failed"?XCircle:Radar;return <div key={r.url+"-"+i} className="flex gap-4 rounded-2xl border border-white/10 bg-black/15 p-4"><Icon className={r.status==="success"?"text-lime-300":r.status==="captcha_required"?"text-amber-300":"text-slate-500"}/><div className="min-w-0"><div className="break-all text-sm font-semibold text-slate-200">{r.url||"Request"}</div><p className="mt-1 text-sm text-slate-500">{r.message}</p></div></div>})}</div>}</section>
      <footer className="mt-10 pb-4 text-center text-xs text-slate-700">BOOKAIRFREIGHT • OUTBOUND CONTROL ROOM</footer>
    </div>
  </main>;
}
