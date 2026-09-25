"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, ExternalLink, RefreshCw, Search, Target, TrendingUp, Waves, Zap } from "lucide-react";
import type { OutboundActivity } from "@/lib/outbound-types";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Props={activities:OutboundActivity[]; session:any};

const REGIONS=[
  {id:"us",label:"United States",short:"US"},
  {id:"eu",label:"Europe",short:"EU"},
  {id:"au",label:"Australia",short:"AU"},
  {id:"in",label:"India",short:"IN"},
  {id:"uk",label:"United Kingdom",short:"UK"},
  {id:"mea",label:"Middle East",short:"MEA"},
];

const regionLanes:Record<string,string>={
  us:"Asia → US / North America",
  eu:"Asia → Europe",
  au:"Asia → Australia",
  in:"India / Indian Subcontinent",
  uk:"Asia → UK / North Europe",
  mea:"Asia → Middle East / Africa",
};

const targetProfiles:Record<string,string[]>={
  cost:["Importers","Procurement teams","Distributors"],
  capacity:["Importers","Manufacturers","Supply-chain teams"],
  reliability:["Operations","Supply-chain teams","Time-sensitive shippers"],
  congestion:["Importers","Warehouse teams","Operations"],
  routing:["Supply-chain teams","Logistics managers","Import/export teams"],
  trade:["Importers","Procurement","Compliance / trade teams"],
  peak:["Retailers","Manufacturers","Distributors"],
  visibility:["Supply-chain teams","Inventory planners","Operations"],
  air:["Time-critical shippers","Electronics / tech","Manufacturers"],
};

function scoreLabel(score:number){
  if(score>=75)return "Strong signal";
  if(score>=50)return "Relevant signal";
  if(score>=25)return "Emerging signal";
  return "Limited evidence";
}

function scoreTone(score:number){
  if(score>=75)return "border-lime-200 bg-lime-50 text-lime-800";
  if(score>=50)return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function sourceHost(url:string){
  try{return new URL(url).hostname.replace(/^www\./,"")}catch{return url}
}

export function MarketIntelligenceEngine({activities,session}:Props){
  const supabase=useMemo(()=>getSupabaseBrowser(),[]);
  const [selected,setSelected]=useState("us");
  const [result,setResult]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [ran,setRan]=useState(false);

  async function runResearch(){
    setLoading(true);setError("");
    try{
      let token=session?.access_token;
      if(!token){
        const current=await supabase.auth.getSession();
        token=current.data.session?.access_token;
      }
      if(!token)throw new Error("Your Outbound OS session has expired. Please sign in again.");
      const res=await fetch("/api/intelligence/research",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
        body:JSON.stringify({regions:REGIONS.map(r=>r.id),activities:activities.slice(0,3000)}),
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"Market research failed.");
      setResult(data);setRan(true);
    }catch(e){setError(e instanceof Error?e.message:"Market research failed.");}
    finally{setLoading(false);}
  }

  useEffect(()=>{if(session&&!ran)runResearch();},[session]); // intentionally runs once when the intelligence tab mounts

  const selectedRegion=result?.regions?.find((r:any)=>r.regionId===selected);
  const opportunities=useMemo(()=>{
    if(!result?.regions)return [];
    return result.regions.flatMap((r:any)=>r.topics.slice(0,2).map((t:any)=>({...t,regionId:r.regionId,region:r.region,regionLane:regionLanes[r.regionId]||r.region})))
      .sort((a:any,b:any)=>b.evidenceScore-a.evidenceScore).slice(0,6);
  },[result]);

  const marketPulse=useMemo(()=>{
    if(!result?.regions)return [];
    return result.regions.map((r:any)=>{
      const top=r.topics?.[0];
      return {...r,top};
    });
  },[result]);

  return <div className="space-y-6">
    <section className="rounded-[2rem] border border-blue-200 bg-gradient-to-br from-[#eef6ff] via-white to-[#eff9f2] p-6 shadow-[0_18px_60px_rgba(77,92,255,.08)] sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-4xl">
          <p className="text-[10px] font-black uppercase tracking-[.35em] text-cyan-500">BOOKAIRFREIGHT / MARKET INTELLIGENCE</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-5xl">What is happening in freight — and what should we do about it?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Current freight-market signals are combined with BAF outbound history to turn external events into markets, pain points, target buyers and concrete outreach opportunities.</p>
        </div>
        <button onClick={runResearch} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#4d5cff] px-4 py-3 text-sm font-black text-white shadow-sm disabled:cursor-wait disabled:opacity-60">
          <RefreshCw size={16} className={loading?"animate-spin":""}/>{loading?"Researching…":"Refresh intelligence"}
        </button>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
        <span className="rounded-full bg-white px-3 py-1.5 border border-slate-200">LIVE MARKET SOURCES</span>
        <span>→</span><span className="rounded-full bg-white px-3 py-1.5 border border-slate-200">MARKET SIGNAL</span>
        <span>→</span><span className="rounded-full bg-white px-3 py-1.5 border border-slate-200">BUYER PAIN</span>
        <span>→</span><span className="rounded-full bg-white px-3 py-1.5 border border-slate-200">OUTREACH DECISION</span>
      </div>
      {result?.generatedAt&&<p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Research snapshot · {new Date(result.generatedAt).toLocaleString("en-US",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</p>}
      {error&&<div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}
    </section>

    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div><p className="text-[10px] font-black uppercase tracking-[.3em] text-cyan-500">01 / MARKET PULSE</p><h3 className="mt-1 text-2xl font-black">Where is the market giving us a reason to investigate?</h3></div>
        <span className="hidden text-xs font-bold text-slate-400 sm:block">External evidence first · outbound data validates</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {marketPulse.map((r:any)=><button key={r.regionId} onClick={()=>setSelected(r.regionId)} className={"text-left rounded-2xl border p-5 transition hover:-translate-y-0.5 "+(selected===r.regionId?"border-[#4d5cff] bg-[#f3f5ff] shadow-sm":"border-slate-200 bg-white")}>
          <div className="flex items-center justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#4d5cff] text-[10px] font-black text-white">{REGIONS.find(x=>x.id===r.regionId)?.short}</span><span className={"rounded-full border px-2.5 py-1 text-[9px] font-black uppercase "+scoreTone(r.top?.evidenceScore||0)}>{scoreLabel(r.top?.evidenceScore||0)}</span></div>
          <h4 className="mt-4 text-lg font-black">{r.region}</h4>
          <p className="mt-1 text-xs font-bold text-slate-400">{regionLanes[r.regionId]}</p>
          {r.top?<><p className="mt-4 text-sm font-black">{r.top.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{r.top.marketSources} external source{r.top.marketSources===1?"":"s"} · {r.top.internal?.mentions||0} relevant BAF mentions</p></>:<p className="mt-4 text-xs text-slate-400">No current evidence returned.</p>}
        </button>)}
      </div>
    </section>

    {selectedRegion&&<section className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-600"><Waves size={19}/></div><div><p className="text-[10px] font-black uppercase tracking-[.3em] text-cyan-500">02 / MARKET → PAIN POINT</p><h3 className="mt-1 text-2xl font-black">{selectedRegion.region}</h3></div></div>
        <p className="mt-2 text-xs font-bold text-slate-400">{regionLanes[selectedRegion.regionId]}</p>
        <div className="mt-5 space-y-3">
          {selectedRegion.topics.map((t:any,i:number)=><div key={t.id} className={"rounded-2xl border p-4 "+(i===0?"border-blue-200 bg-blue-50/60":"border-slate-100 bg-slate-50/50")}>
            <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className="text-[10px] font-black text-[#4d5cff]">0{i+1}</span><h4 className="text-sm font-black">{t.label}</h4></div><p className="mt-2 text-xs leading-5 text-slate-600">{t.angle}</p></div><span className="shrink-0 text-sm font-black">{t.evidenceScore}</span></div>
            <div className="mt-3 flex flex-wrap gap-2">{t.evidence?.slice(0,3).map((e:any)=><a key={e.source} href={e.url} target="_blank" rel="noreferrer" onClick={e2=>e2.stopPropagation()} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-bold text-slate-500 hover:text-[#4d5cff]">{sourceHost(e.url)} <ExternalLink size={10}/></a>)}</div>
          </div>)}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-lime-50 text-lime-700"><Target size={19}/></div><div><p className="text-[10px] font-black uppercase tracking-[.3em] text-lime-600">03 / WHO TO TALK TO</p><h3 className="mt-1 text-2xl font-black">Buyer & campaign angle</h3></div></div>
        {selectedRegion.topics[0]&&<div className="mt-6">
          <div className="rounded-2xl border border-lime-200 bg-lime-50 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-lime-700">Primary intelligence topic</p><h4 className="mt-2 text-xl font-black">{selectedRegion.topics[0].label}</h4><p className="mt-2 text-sm leading-6 text-slate-700">{selectedRegion.topics[0].angle}</p></div>
          <div className="mt-5"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target profiles</p><div className="mt-2 flex flex-wrap gap-2">{(targetProfiles[selectedRegion.topics[0].id]||["Importers","Logistics managers"]).map(x=><span key={x} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{x}</span>)}</div></div>
          <div className="mt-5"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Suggested campaign theme</p><div className="mt-2 flex items-start gap-3 rounded-2xl border border-slate-200 p-4"><Zap size={17} className="mt-0.5 shrink-0 text-[#4d5cff]"/><p className="text-sm font-black text-slate-700">{selectedRegion.topics[0].angle}</p></div></div>
        </div>}
      </div>
    </section>}

    <section>
      <div className="mb-4"><p className="text-[10px] font-black uppercase tracking-[.3em] text-[#4d5cff]">04 / CAMPAIGN OPPORTUNITIES</p><h3 className="mt-1 text-2xl font-black">Market signals that can become outreach experiments</h3></div>
      <div className="grid gap-4 lg:grid-cols-2">
        {opportunities.map((o:any,i:number)=><div key={o.regionId+"-"+o.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{String(i+1).padStart(2,"0")} · {o.region}</p><h4 className="mt-1 text-lg font-black">{o.label}</h4><p className="mt-1 text-xs font-bold text-slate-400">{o.regionLane}</p></div><span className={"rounded-full border px-2.5 py-1 text-[9px] font-black uppercase "+scoreTone(o.evidenceScore)}>{o.evidenceScore} evidence</span></div>
          <p className="mt-4 text-sm leading-6 text-slate-600">{o.angle}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Market evidence</p><p className="mt-1 text-sm font-black">{o.marketSources} source{o.marketSources===1?"":"s"}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">BAF history</p><p className="mt-1 text-sm font-black">{o.internal?.mentions||0} relevant mentions</p></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">{(targetProfiles[o.id]||["Importers","Supply-chain teams"]).slice(0,3).map((x:string)=><span key={x} className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black text-blue-700">{x}</span>)}</div>
        </div>)}
      </div>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.3em] text-lime-600">05 / BAF VALIDATION</p><h3 className="mt-1 text-2xl font-black">Does our own outbound history support the signal?</h3></div><Activity size={20} className="text-lime-600"/></div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {selectedRegion?.topics?.slice(0,3).map((t:any)=><div key={t.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="text-sm font-black">{t.label}</p><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div><p className="text-lg font-black">{t.internal?.mentions||0}</p><p className="text-[8px] font-black uppercase tracking-wider text-slate-400">mentions</p></div><div><p className="text-lg font-black">{t.internal?.responses||0}</p><p className="text-[8px] font-black uppercase tracking-wider text-slate-400">responses</p></div><div><p className="text-lg font-black">{t.internal?.positive||0}</p><p className="text-[8px] font-black uppercase tracking-wider text-slate-400">positive</p></div></div></div>)}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-400">BAF history is validation evidence, not a prediction. A market signal can be worth investigating even when historical outreach volume is small.</p>
    </section>

    <section className="rounded-3xl border border-[#4d5cff]/20 bg-[#f5f6ff] p-6">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#4d5cff]"><TrendingUp size={18}/></div><div><p className="text-[10px] font-black uppercase tracking-[.3em] text-[#4d5cff]">06 / TODAY'S INTELLIGENCE</p><h3 className="mt-1 text-2xl font-black">What should the team investigate next?</h3></div></div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {opportunities.slice(0,3).map((o:any)=><div key={o.regionId+"today"} className="rounded-2xl border border-white bg-white p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{o.region}</p><p className="mt-2 text-sm font-black">{o.label}</p><p className="mt-2 text-xs leading-5 text-slate-500">Investigate this market signal and test a prospect-specific outreach angle around the identified pain point.</p><div className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#4d5cff]">Investigate <ArrowRight size={12}/></div></div>)}
      </div>
      {!loading&&ran&&opportunities.length===0&&<div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-500"><CheckCircle2 size={16}/> No actionable market opportunities were returned in this snapshot.</div>}
    </section>

    <p className="text-[10px] leading-5 text-slate-400">Research strength is based on source evidence and relevant BAF history. It is not a guaranteed response rate or prediction of campaign performance.</p>
  </div>
}
