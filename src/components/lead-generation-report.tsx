"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { BarChart3, Globe2, MailCheck, PieChart, Rocket, Ship, Sparkles, Target, TrendingUp, Users } from "lucide-react";

type ReportSummary = { total:number; addedToday:number; assigned:number; business:number; personal:number; sources:[string,number][]; rawSheets:[string,number][]; countries:[string,number][]; industries:[string,number][]; last7:{key:string;count:number}[] };
const palette = ["#4f46e5","#06b6d4","#f97316","#22c55e","#e879f9","#eab308","#64748b"];
function Donut({items, total}:{items:[string,number][];total:number}) {
  let cursor = 0;
  const stops = items.slice(0,7).map(([label,count],i)=>{const start=cursor;cursor += total ? count/total*100 : 0;return `${palette[i%palette.length]} ${start}% ${cursor}%`;});
  return <div className="relative mx-auto h-36 w-36 shrink-0 rounded-full" style={{background:total?`conic-gradient(${stops.join(",")})`:"conic-gradient(#dbeafe 0% 100%)", animation:"leadDonutIn .9s ease-out both"}}>
    <div className="absolute inset-5 grid place-content-center rounded-full bg-white text-center shadow-inner"><b className="text-2xl text-slate-900">{total.toLocaleString()}</b><span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Leads</span></div>
  </div>;
}
function Breakdown({title,items,total,limit=7}:{title:string;items:[string,number][];total:number;limit?:number}) {
  return <section className="rounded-2xl border border-blue-100 bg-white/90 p-4 shadow-sm">
    <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800"><BarChart3 size={16} className="text-indigo-500"/>{title}</h3>
    {items.length ? <div className="space-y-3">{items.slice(0,limit).map(([label,count],i)=><div key={`${label}-${i}`}>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-semibold text-slate-600" title={label}>{label}</span><b className="shrink-0 tabular-nums text-slate-900">{count.toLocaleString()} <span className="font-normal text-slate-400">({total?Math.round(count/total*100):0}%)</span></b></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{width:(total?count/total*100:0)+"%",background:palette[i%palette.length],animation:"leadBarGrow .9s ease-out both"}}/></div>
    </div>)}</div> : <p className="text-xs text-slate-400">Metrics appear after new leads are uploaded.</p>}
  </section>;
}
export function LeadGenerationReport() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [report,setReport] = useState<ReportSummary | null>(null);
  const [busy,setBusy] = useState(true);
  const [error,setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const {data} = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in through Outbound OS to view lead generation reporting.");
      const res = await fetch("/api/lead-inventory/report", {headers:{Authorization:"Bearer "+data.session.access_token}});
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load lead-generation metrics");
      setReport(body);
    } catch(e) { setError(e instanceof Error ? e.message : "Could not load report"); }
    finally { setBusy(false); }
  },[supabase]);
  useEffect(()=>{void load()},[load]);
  const total = report?.total ?? 0;
  const assigned = report?.assigned ?? 0;
  const business = report?.business ?? 0;
  const personal = report?.personal ?? 0;
  const sources = report?.sources ?? [];
  const rawSheets = report?.rawSheets ?? [];
  const countries = report?.countries ?? [];
  const industries = report?.industries ?? [];
  const emailTypes: [string, number][] = ([["Business Email",business],["Personal Email",personal],["Not specified",Math.max(0,total-business-personal)]] as [string, number][]).filter((x) => x[1] > 0);
  const last7 = (report?.last7 ?? []).map(day=>({...day,label:new Date(day.key+"T12:00:00").toLocaleDateString("en",{weekday:"short"})}));
  const maxDaily=Math.max(1,...last7.map(x=>x.count));
  return <div className="mb-6 space-y-5">
    <style>{`@keyframes leadFlyAcross{0%{transform:translateX(-25px) translateY(7px) rotate(-9deg);opacity:.2}50%{opacity:1}100%{transform:translateX(18px) translateY(-5px) rotate(5deg);opacity:1}} @keyframes leadBoatBob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-7px) rotate(2deg)}} @keyframes leadRocketLaunch{0%,100%{transform:translateY(0) rotate(-8deg)}50%{transform:translateY(-10px) rotate(3deg)}} @keyframes leadDonutIn{from{transform:scale(.7) rotate(-90deg);opacity:.25}to{transform:scale(1) rotate(0);opacity:1}} @keyframes leadBarGrow{from{width:0;opacity:.4}} @keyframes leadSpark{0%,100%{opacity:.45;transform:scale(.85)}50%{opacity:1;transform:scale(1.12)}} .lead-fly{animation:leadFlyAcross 2.6s ease-in-out infinite alternate}.lead-boat{animation:leadBoatBob 2s ease-in-out infinite}.lead-rocket{animation:leadRocketLaunch 1.6s ease-in-out infinite}.lead-spark{animation:leadSpark 1.8s ease-in-out infinite}`}</style>
    <header className="relative overflow-hidden rounded-3xl border border-indigo-200 bg-gradient-to-r from-indigo-950 via-indigo-800 to-cyan-700 p-6 text-white shadow-lg md:p-7">
      <div className="pointer-events-none absolute -right-3 top-2 flex items-center gap-5 opacity-90"><Rocket size={42} className="lead-rocket text-orange-300"/><Ship size={54} className="lead-boat text-cyan-100"/><Sparkles size={28} className="lead-spark text-yellow-200"/></div>
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-4 pr-28">
        <div><p className="text-[10px] font-black uppercase tracking-[.3em] text-cyan-200">Lead Generation · Daily Flight Deck</p><h2 className="mt-2 text-2xl font-black text-cyan-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] md:text-3xl">Lead Generation Report</h2><p className="mt-2 max-w-2xl text-sm text-indigo-100">New leads only · email is the source of truth · metrics by lead source, raw data sheet, country and industry.</p></div>
        <button onClick={()=>void load()} disabled={busy} className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 disabled:opacity-50">↻ Refresh report</button>
      </div>
      <div className="relative mt-5 flex items-center gap-3 overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-3 text-xs text-indigo-50"><span className="text-xl lead-fly">✈️</span><span>New lead radar</span><div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20"><div className="h-full w-2/3 rounded-full bg-gradient-to-r from-cyan-300 via-yellow-300 to-orange-300" style={{animation:"leadBarGrow 1.2s ease-out"}}/></div><span className="text-xl lead-boat">🚢</span><span className="text-xl lead-rocket">🚀</span></div>
    </header>
    {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[
        {label:"Total leads in inventory",value:total,icon:Users,note:"All unique email addresses currently stored",accent:"from-indigo-500 to-violet-500"},
        {label:"Added today",value:report?.addedToday ?? 0,icon:Rocket,note:"New records uploaded today",accent:"from-orange-400 to-rose-500"},
        {label:"Assigned for outreach",value:assigned,icon:Target,note:"Fresh Outreach assignment set",accent:"from-cyan-500 to-blue-500"},
        {label:"Still unassigned",value:total-assigned,icon:MailCheck,note:"Available for team assignment",accent:"from-emerald-400 to-teal-600"}
      ].map((card,i)=>{const Icon=card.icon;return <article key={card.label} className="group relative overflow-hidden rounded-2xl border border-blue-100 bg-white p-4 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg"><div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`}/><div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{card.label}</span><Icon size={20} className={i===1?"lead-rocket text-orange-500":i===2?"lead-fly text-blue-500":"text-indigo-500"}/></div><div className="mt-3 text-3xl font-black tabular-nums text-slate-900">{busy?"…":card.value.toLocaleString()}</div><p className="mt-1 text-xs text-slate-500">{card.note}</p></article>})}
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr_1fr]">
      <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm"><h3 className="mb-4 flex items-center gap-2 text-sm font-black"><PieChart size={16} className="text-indigo-500"/>Email type mix</h3><div className="flex flex-wrap items-center gap-5"><Donut items={emailTypes} total={total}/><div className="min-w-32 flex-1 space-y-2">{emailTypes.map(([label,count],i)=><div key={`${label}-${i}`} className="flex items-center gap-2 text-xs"><span className="h-2.5 w-2.5 rounded-full" style={{background:palette[i]}}/><span className="flex-1 text-slate-600">{label}</span><b>{count.toLocaleString()}</b></div>)}</div></div><p className="mt-3 text-[10px] text-slate-400">Based on the Business / Personal Email column.</p></section>
      <Breakdown title="Leads by lead source" items={sources} total={total}/>
      <Breakdown title="Leads by raw data sheet" items={rawSheets} total={total}/>
    </div>
    <div className="grid gap-4 xl:grid-cols-3">
      <Breakdown title="Country-wise lead count" items={countries} total={total} limit={250}/>
      <Breakdown title="Industry-wise lead count" items={industries} total={total}/>
      <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm"><h3 className="mb-1 flex items-center gap-2 text-sm font-black"><TrendingUp size={16} className="text-indigo-500"/>Last 7 days · uploads</h3><p className="mb-4 text-xs text-slate-500">Daily additions to Central Lead Inventory</p><div className="flex h-32 items-end justify-between gap-2">{last7.map((day,i)=><div key={day.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><span className="text-[10px] font-bold text-slate-600">{day.count}</span><div className="flex w-full flex-1 items-end"><div title={day.key+": "+day.count+" leads"} className="w-full rounded-t-lg bg-gradient-to-t from-indigo-600 to-cyan-400 transition-all duration-700" style={{height:Math.max(day.count?8:2,day.count/maxDaily*100)+"%",animation:"leadBarGrow .8s ease-out both",animationDelay:(i*70)+"ms"}}/></div><span className="text-[10px] text-slate-400">{day.label}</span></div>)}</div><div className="mt-3 flex items-center gap-2 rounded-xl bg-cyan-50 p-2 text-xs text-cyan-800"><Globe2 size={15}/>Only records created in the last seven calendar days are counted.</div></section>
    </div>
    {!busy&&total===0&&<div className="rounded-2xl border border-dashed border-indigo-200 bg-white/80 p-5 text-center"><div className="mb-2 text-3xl">🛫</div><p className="font-bold text-slate-700">Ready for take-off!</p><p className="mt-1 text-sm text-slate-500">Upload today&apos;s new lead sheet below. Duplicate email addresses are skipped, and the report calculates metrics automatically.</p></div>}
  </div>;
}
