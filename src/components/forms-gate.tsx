"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { SenderWorkspace } from "@/components/sender-workspace";
export function FormsGate(){
  const supabase=getSupabaseBrowser(); const [ready,setReady]=useState(false); const [ok,setOk]=useState(false);
  useEffect(()=>{(async()=>{const {data}=await supabase.auth.getSession();if(data.session){const r=await fetch("/api/outbound/data",{headers:{Authorization:"Bearer "+data.session.access_token}});setOk(r.ok)}setReady(true)})()},[supabase]);
  if(!ready)return <div className="min-h-screen bg-[#070b12] grid place-items-center text-slate-500">Checking access…</div>;
  if(!ok)return <div className="min-h-screen bg-[#070b12] grid place-items-center p-6 text-white"><div className="glass rounded-3xl p-8 text-center"><h1 className="text-2xl font-black">Sign in required</h1><p className="mt-2 text-sm text-slate-500">Return to the Outbound OS and sign in with your team account.</p><Link href="/" className="mt-5 inline-block rounded-xl bg-lime-300 px-4 py-3 font-black text-slate-950">Back to login</Link></div></div>;
  return <SenderWorkspace/>;
}
