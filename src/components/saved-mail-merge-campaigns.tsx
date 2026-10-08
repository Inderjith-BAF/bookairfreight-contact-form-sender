"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock3, Mail, RefreshCw, Trash2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Campaign={id:string;name:string;country:string;campaign_group:string;status:string;updated_at?:string;created_at?:string};

export function SavedMailMergeCampaigns(){
 const supabase=useMemo(()=>getSupabaseBrowser(),[]);
 const [token,setToken]=useState("");
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [loading,setLoading]=useState(true);
 const [deleting,setDeleting]=useState("");
 const load=async(t:string)=>{
  if(!t)return;
  const r=await fetch("/api/mail-merge",{headers:{Authorization:"Bearer "+t}});
  const d=await r.json().catch(()=>({}));
  if(r.ok)setCampaigns((d.campaigns||[]).filter((c:Campaign)=>["Draft","Ready"].includes(c.status)).slice(0,8));
  setLoading(false);
 };
 useEffect(()=>{let mounted=true;(async()=>{const {data}=await supabase.auth.getSession();if(!mounted)return;const t=data.session?.access_token||"";setToken(t);if(t)await load(t);else setLoading(false)})();const {data}=supabase.auth.onAuthStateChange((_e,s)=>{const t=s?.access_token||"";setToken(t);if(t)load(t)});return()=>{mounted=false;data.subscription.unsubscribe()}},[supabase]);
 if(!token||(!loading&&!campaigns.length))return null;
 return <section className="mb-5 rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-indigo-500"><Mail size={14}/> Mail Merge</div><h2 className="mt-1 text-xl font-black">Saved & unsent campaigns</h2><p className="mt-1 text-sm text-slate-500">Resume a draft or a prepared campaign without rebuilding the recipients and message blocks.</p></div>
   <button type="button" onClick={()=>load(token)} className="rounded-xl border border-blue-100 p-2 text-indigo-600" title="Refresh saved campaigns"><RefreshCw size={16}/></button>
  </div>
  {loading?<div className="mt-4 text-sm text-slate-400">Loading saved campaigns…</div>:<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{campaigns.map(c=><div key={c.id} className="group rounded-2xl border border-blue-100 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50/40"><div className="flex items-start justify-between gap-3"><div><div className="font-black">{c.name}</div><div className="mt-1 text-xs text-slate-500">{c.country} · {c.campaign_group}</div></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase text-amber-700">{c.status}</span></div><div className="mt-4 flex items-center justify-between gap-2 text-xs text-slate-400"><span><Clock3 size={13} className="mr-1 inline"/>{c.updated_at?new Date(c.updated_at).toLocaleString():c.created_at?new Date(c.created_at).toLocaleString():"Saved"}</span><div className="flex items-center gap-2">{c.status==="Draft"&&<button type="button" title="Delete draft" aria-label={"Delete draft "+c.name} disabled={deleting===c.id} onClick={async()=>{if(deleting)return;if(!window.confirm("Delete this draft campaign? This cannot be undone."))return;setDeleting(c.id);try{const r=await fetch("/api/mail-merge?id="+encodeURIComponent(c.id),{method:"DELETE",headers:{Authorization:"Bearer "+token}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Unable to delete draft.");setCampaigns(prev=>prev.filter(x=>x.id!==c.id));}catch(err){window.alert(err instanceof Error?err.message:"Unable to delete draft.");}finally{setDeleting("")}}} className="rounded-lg border border-red-100 bg-white p-1.5 text-red-500 transition hover:border-red-200 hover:bg-red-50 disabled:opacity-50"><Trash2 size={14}/></button>}<Link href={"/mail-merge?campaignId="+encodeURIComponent(c.id)} className="font-black text-indigo-600">Resume <ChevronRight size={13} className="inline transition group-hover:translate-x-0.5"/></Link></div></div></div>)}</div>}</section>;
}
