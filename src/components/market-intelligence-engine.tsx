"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, ExternalLink, RefreshCw, Search, Target, TrendingUp, Waves, Zap } from "lucide-react";
import type { OutboundActivity } from "@/lib/outbound-types";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { FREIGHT_INTELLIGENCE_LANES, FREIGHT_INTELLIGENCE_REGIONS } from "@/lib/freight-intelligence";

type Props={activities:OutboundActivity[]; session:any};

const REGIONS=FREIGHT_INTELLIGENCE_REGIONS.map(r=>({id:r.id,label:r.label,short:r.label.slice(0,3).toUpperCase()}));
const LANES=FREIGHT_INTELLIGENCE_LANES;
const CORE_LANES=LANES.slice(0,6);
const FUTURE_LANES=LANES.slice(6);

const regionLanes:Record<string,string>=Object.fromEntries(REGIONS.map(r=>[r.id,`China → ${r.label}`]));

const targetProfiles:Record<string,string[]>={
  cost:["Business owners / founders","Importers & distributors","E-commerce brands"],
  capacity:["Business owners / founders","Importers","Manufacturers & wholesalers"],
  reliability:["Business owners / founders","Operations owners","Time-sensitive shippers"],
  congestion:["Business owners / founders","Importers","Warehouse-dependent businesses"],
  routing:["Business owners / founders","Import/export businesses","Logistics decision-makers"],
  trade:["Business owners / founders","Importers","Trade/compliance owners"],
  peak:["Business owners / founders","Retailers","Manufacturers & distributors"],
  visibility:["Business owners / founders","Importers","Inventory-dependent businesses"],
  air:["Business owners / founders","Time-critical shippers","Manufacturers / e-commerce brands"],
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
  const [investigating,setInvestigating]=useState<string>("");
  const [investigation,setInvestigation]=useState<any>(null);
  const [investigationError,setInvestigationError]=useState("");
  const [generatingCampaign,setGeneratingCampaign]=useState(false);
  const [campaign,setCampaign]=useState<any>(null);
  const [campaignError,setCampaignError]=useState("");

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

  async function investigateOpportunity(o:any){
    setInvestigating(o.id); setInvestigation(null); setInvestigationError("");
    try{
      let token=session?.access_token;
      if(!token){const current=await supabase.auth.getSession(); token=current.data.session?.access_token;}
      if(!token)throw new Error("Your Outbound OS session has expired. Please sign in again.");
      const res=await fetch("/api/intelligence/investigate",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
        body:JSON.stringify({regionId:o.regionId,topicId:o.id,activities:activities.slice(0,3000)})
      });
      const data=await res.json().catch(()=>({error:"Investigation returned an invalid response."}));
      if(!res.ok)throw new Error(data.error||"Investigation failed.");
      setInvestigation(data);
      setTimeout(()=>document.getElementById("investigation-result")?.scrollIntoView({behavior:"smooth",block:"start"}),50);
    }catch(e){setInvestigationError(e instanceof Error?e.message:"Investigation failed.");}
    finally{setInvestigating("");}
  }

  async function generateCampaign(){
    if(!investigation)return;
    setGeneratingCampaign(true);setCampaign(null);setCampaignError("");
    try{
      let token=session?.access_token;
      if(!token){const current=await supabase.auth.getSession();token=current.data.session?.access_token;}
      if(!token)throw new Error("Your Outbound OS session has expired. Please sign in again.");
      const res=await fetch("/api/intelligence/campaign",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
        body:JSON.stringify({regionId:selected,topicId:investigation.topic.id,investigation})
      });
      const data=await res.json().catch(()=>({error:"Campaign generation returned an invalid response."}));
      if(!res.ok)throw new Error(data.error||"Campaign generation failed.");
      setCampaign(data);
      setTimeout(()=>document.getElementById("generated-campaign")?.scrollIntoView({behavior:"smooth",block:"start"}),50);
    }catch(e){setCampaignError(e instanceof Error?e.message:"Campaign generation failed.");}
    finally{setGeneratingCampaign(false);}
  }

  const selectedRegion=result?.regions?.find((r:any)=>r.regionId===selected);
  const opportunities=useMemo(()=>{
    if(!selectedRegion)return [];
    return selectedRegion.topics.slice(0,3).map((t:any)=>({
      ...t,
      regionId:selectedRegion.regionId,
      region:selectedRegion.region,
      regionLane:regionLanes[selectedRegion.regionId]||selectedRegion.region
    }));
  },[selectedRegion]);

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
          <h2 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-5xl">What is happening on our trade lanes — and which business owners should we talk to?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Current freight-market signals are combined with BAF outbound history to identify China-origin trade-lane opportunities, the business-owner pain points behind them, and the outreach opportunities worth testing.</p>
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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[10px] font-black uppercase tracking-[.3em] text-cyan-500">01 / MARKET PULSE</p><h3 className="mt-1 text-2xl font-black">Select a China-origin trade lane to investigate</h3></div>
        <span className="text-xs font-bold text-slate-400">External evidence first · BAF history validates</span>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="intelligence-route" className="block text-[10px] font-black uppercase tracking-[.3em] text-slate-400">Trade lane</label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <select id="intelligence-route" value={selected} onChange={e=>setSelected(e.target.value)} className="min-h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-800 outline-none focus:border-[#4d5cff] focus:ring-2 focus:ring-[#4d5cff]/10">
            <optgroup label="Core markets">
              {CORE_LANES.map(l=><option key={l.id} value={l.regionId}>{l.label}</option>)}
            </optgroup>
            <optgroup label="Future destination coverage">
              {FUTURE_LANES.map(l=><option key={l.id} value={l.regionId}>{l.label}</option>)}
            </optgroup>
          </select>
          {selectedRegion&&<div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-blue-500">Selected destination</p>
            <p className="mt-1 text-sm font-black text-slate-800">{selectedRegion.region}</p>
          </div>}
        </div>
      </div>

      {selectedRegion&&<div className="mt-4 rounded-3xl border border-[#4d5cff]/20 bg-[#f5f6ff] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.3em] text-[#4d5cff]">SELECTED ROUTE</p>
            <h4 className="mt-1 text-2xl font-black">{regionLanes[selectedRegion.regionId]||selectedRegion.region}</h4>
            <p className="mt-1 text-xs font-bold text-slate-400">Current market evidence for this destination</p>
          </div>
          {selectedRegion.topics[0]&&<span className={"rounded-full border px-3 py-1.5 text-[9px] font-black uppercase "+scoreTone(selectedRegion.topics[0].evidenceScore)}>{scoreLabel(selectedRegion.topics[0].evidenceScore)}</span>}
        </div>
        {selectedRegion.topics[0]&&<div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-2xl border border-white bg-white p-5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Top market signal</p>
            <h5 className="mt-2 text-lg font-black">{selectedRegion.topics[0].label}</h5>
            <p className="mt-2 text-sm leading-6 text-slate-600">{selectedRegion.topics[0].angle}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Sources</p><p className="mt-1 text-lg font-black">{selectedRegion.topics[0].marketSources}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">BAF mentions</p><p className="mt-1 text-lg font-black">{selectedRegion.topics[0].internal?.mentions||0}</p></div>
            </div>
          </div>
          <div className="rounded-2xl border border-white bg-white p-5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Source evidence</p>
            {selectedRegion.topics[0].evidence?.slice(0,2).map((e:any)=><div key={e.source} className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <a href={e.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-[#4d5cff]">{sourceHost(e.url)} <ExternalLink size={11}/></a>
              {e.snippet&&<p className="mt-2 text-[11px] leading-5 text-slate-500">{e.snippet}</p>}
            </div>)}
            {!selectedRegion.topics[0].evidence?.length&&<p className="mt-3 text-xs text-slate-400">No source evidence was returned for this signal.</p>}
          </div>
        </div>}
      </div>}
    </section>

    {selectedRegion&&<section className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-600"><Waves size={19}/></div><div><p className="text-[10px] font-black uppercase tracking-[.3em] text-cyan-500">02 / MARKET → PAIN POINT</p><h3 className="mt-1 text-2xl font-black">{selectedRegion.region}</h3></div></div>
        <p className="mt-2 text-xs font-bold text-slate-400">{regionLanes[selectedRegion.regionId]}</p>
        <div className="mt-5 space-y-3">
          {selectedRegion.topics.map((t:any,i:number)=><div key={t.id} className={"rounded-2xl border p-4 "+(i===0?"border-blue-200 bg-blue-50/60":"border-slate-100 bg-slate-50/50")}>
            <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className="text-[10px] font-black text-[#4d5cff]">0{i+1}</span><h4 className="text-sm font-black">{t.label}</h4></div><p className="mt-2 text-xs leading-5 text-slate-600">{t.angle}</p></div><span className="shrink-0 text-sm font-black">{t.evidenceScore}</span></div>
            <div className="mt-3 flex flex-wrap gap-2">{t.evidence?.slice(0,3).map((e:any)=><a key={e.source} href={e.url} target="_blank" rel="noreferrer" onClick={e2=>e2.stopPropagation()} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-bold text-slate-500 hover:text-[#4d5cff]">{sourceHost(e.url)} <ExternalLink size={10}/></a>)}</div>{t.evidence?.[0]?.snippet&&<p className="mt-3 border-l-2 border-cyan-300 pl-3 text-[11px] leading-5 text-slate-500">{t.evidence[0].snippet}</p>}
          </div>)}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-lime-50 text-lime-700"><Target size={19}/></div><div><p className="text-[10px] font-black uppercase tracking-[.3em] text-lime-600">03 / WHO TO TALK TO</p><h3 className="mt-1 text-2xl font-black">Business owner & campaign angle</h3></div></div>
        {selectedRegion.topics[0]&&<div className="mt-6">
          <div className="rounded-2xl border border-lime-200 bg-lime-50 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-lime-700">Primary intelligence topic</p><h4 className="mt-2 text-xl font-black">{selectedRegion.topics[0].label}</h4><p className="mt-2 text-sm leading-6 text-slate-700">{selectedRegion.topics[0].angle}</p></div>
          <div className="mt-5"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Business owners to target</p><div className="mt-2 flex flex-wrap gap-2">{(targetProfiles[selectedRegion.topics[0].id]||["Importers","Logistics managers"]).map(x=><span key={x} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{x}</span>)}</div></div>
          <div className="mt-5"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Suggested owner-first campaign theme</p><div className="mt-2 flex items-start gap-3 rounded-2xl border border-slate-200 p-4"><Zap size={17} className="mt-0.5 shrink-0 text-[#4d5cff]"/><p className="text-sm font-black text-slate-700">{selectedRegion.topics[0].angle}</p></div></div>
        </div>}
      </div>
    </section>}

    <section id="campaign-opportunities">
      <div className="mb-4"><p className="text-[10px] font-black uppercase tracking-[.3em] text-[#4d5cff]">04 / CAMPAIGN OPPORTUNITIES</p><h3 className="mt-1 text-2xl font-black">Selected route signals that can become outreach experiments</h3></div>
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
        {opportunities.slice(0,3).map((o:any)=><div key={o.regionId+"-"+o.id+"-today"} className="rounded-2xl border border-white bg-white p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{o.region}</p><p className="mt-2 text-sm font-black">{o.label}</p><p className="mt-2 text-xs leading-5 text-slate-500">Investigate this market signal and test a prospect-specific outreach angle around the identified pain point.</p><button type="button" onClick={()=>investigateOpportunity(o)} disabled={!!investigating} className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#4d5cff] hover:underline disabled:opacity-50">{investigating===o.id?"INVESTIGATING…":"INVESTIGATE"} <ArrowRight size={12}/></button></div>)}
      </div>
      {!loading&&ran&&opportunities.length===0&&<div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-500"><CheckCircle2 size={16}/> No actionable market opportunities were returned in this snapshot.</div>}
    </section>

    {investigationError&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{investigationError}</div>}
    {investigation&&<section id="investigation-result" className="rounded-3xl border border-[#4d5cff]/25 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[10px] font-black uppercase tracking-[.3em] text-[#4d5cff]">AUTOMATIC INVESTIGATION</p><h3 className="mt-1 text-2xl font-black">{investigation.route} · {investigation.topic.label}</h3><p className="mt-2 text-xs font-bold text-slate-400">Fresh source check + BAF history + business-owner impact analysis</p></div>
        <div className="rounded-2xl bg-[#f5f6ff] px-4 py-3 text-center"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Research strength</p><p className="mt-1 text-2xl font-black text-[#4d5cff]">{investigation.evidenceScore}</p></div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-5"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">What is happening?</p><p className="mt-2 text-sm leading-6 text-slate-700">{investigation.analysis.marketFinding}</p></div>
        <div className="rounded-2xl bg-slate-50 p-5"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Why should an owner care?</p><p className="mt-2 text-sm leading-6 text-slate-700">{investigation.analysis.businessImpact}</p></div>
        <div className="rounded-2xl bg-slate-50 p-5"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">BAF validation</p><p className="mt-2 text-sm leading-6 text-slate-700">{investigation.analysis.validation}</p></div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-lime-200 bg-lime-50 p-5"><p className="text-[9px] font-black uppercase tracking-widest text-lime-700">Who should we target?</p><p className="mt-2 text-sm font-bold leading-6 text-slate-700">{investigation.analysis.target}</p><p className="mt-4 text-[9px] font-black uppercase tracking-widest text-lime-700">Outreach angle</p><p className="mt-2 text-sm font-black leading-6 text-slate-800">{investigation.analysis.outreachAngle}</p></div>
        <div className="rounded-2xl border border-slate-200 p-5"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Outreach hooks to use</p><ol className="mt-2 space-y-2 text-sm font-bold text-slate-700">{(Array.isArray(investigation.analysis?.hooks)?investigation.analysis.hooks:[]).map((q:string,i:number)=><li key={i} className="rounded-xl bg-white px-3 py-2 leading-5">{q}</li>)}</ol></div>
      </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={generateCampaign} disabled={generatingCampaign} className="inline-flex items-center gap-2 rounded-xl bg-[#4d5cff] px-4 py-3 text-xs font-black text-white shadow-sm disabled:opacity-60">
          <Zap size={14}/>{generatingCampaign?"BUILDING CAMPAIGN…":"GENERATE CAMPAIGN"}
        </button>
        <span className="text-[10px] font-bold text-slate-400">Turns this investigation into a testable outbound campaign.</span>
      </div>
      <div className="mt-5"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Source evidence</p><div className="mt-2 grid gap-3 md:grid-cols-2">{(Array.isArray(investigation.evidence)?investigation.evidence:[]).map((e:any)=><a key={e.source} href={e.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:border-[#4d5cff]"><p className="text-xs font-black text-[#4d5cff]">{e.source}</p><p className="mt-2 text-[11px] leading-5 text-slate-500">{e.snippet||"Relevant topic evidence detected in this source."}</p></a>)}</div></div>
    </section>}
    {campaignError&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{campaignError}</div>}
    {campaign&&<section id="generated-campaign" className="rounded-3xl border border-lime-200 bg-lime-50 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[10px] font-black uppercase tracking-[.3em] text-lime-700">GENERATED CAMPAIGN</p><h3 className="mt-1 text-2xl font-black">{campaign.campaignName}</h3><p className="mt-2 text-xs font-bold text-slate-500">{campaign.target}</p></div>
        <button type="button" onClick={()=>navigator.clipboard?.writeText(campaign.body)} className="rounded-xl border border-lime-300 bg-white px-4 py-2 text-xs font-black text-lime-800 hover:bg-lime-100">COPY EMAIL</button>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white bg-white p-5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Subject lines</p>
          <div className="mt-3 space-y-2">{(campaign.subjectLines||[]).map((s:string,i:number)=><div key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{s}</div>)}</div>
          <p className="mt-5 text-[9px] font-black uppercase tracking-widest text-slate-400">Opening hook</p><p className="mt-2 text-sm font-black leading-6 text-slate-800">{campaign.opening}</p>
        </div>
        <div className="rounded-2xl border border-white bg-white p-5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Cold email draft</p>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">{campaign.body}</pre>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-white bg-white p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Recommended test</p><p className="mt-2 text-sm font-bold text-slate-700">{campaign.nextStep}</p></div>
    </section>}
    <p className="text-[10px] leading-5 text-slate-400">Research strength is based on source evidence and relevant BAF history. It is not a guaranteed response rate or prediction of campaign performance.</p>
  </div>
}
