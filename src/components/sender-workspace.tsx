"use client";

import { useState } from "react";
import type { SenderDetails, SubmissionResult } from "@/types/submission";

const initial: SenderDetails = { name: "", company: "", email: "", phone: "", subject: "", message: "" };

export function SenderWorkspace() {
  const [urls, setUrls] = useState("");
  const [details, setDetails] = useState(initial);
  const [results, setResults] = useState<SubmissionResult[]>([]);
  const [sending, setSending] = useState(false);

  const update = (key: keyof SenderDetails, value: string) => setDetails(prev => ({ ...prev, [key]: value }));

  async function send() {
    const parsedUrls = urls.split(/\r?\n|,/).map(v => v.trim()).filter(Boolean);
    setSending(true); setResults([]);
    try {
      const response = await fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: parsedUrls, details }) });
      const data = await response.json();
      setResults(data.results ?? [{ url: "", status: "failed", message: data.error ?? "Request failed." }]);
    } catch { setResults([{ url: "", status: "failed", message: "Could not connect to the application." }]); }
    finally { setSending(false); }
  }

  return <main className="min-h-screen px-5 py-10 md:px-10">
    <div className="mx-auto max-w-6xl">
      <header className="mb-8"><p className="text-sm font-semibold uppercase tracking-widest text-slate-500">BookAirfreight</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Contact Form Sender</h1><p className="mt-2 text-slate-600">Add target contact-form URLs, provide the sender details, and submit from one workspace.</p></header>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">Contact form URLs</h2><p className="mt-1 text-sm text-slate-500">One URL per line. You can paste multiple URLs at once.</p><textarea value={urls} onChange={e => setUrls(e.target.value)} placeholder="https://example.com/contact" className="mt-4 min-h-56 w-full rounded-xl border border-slate-300 p-4 outline-none focus:border-slate-500" /></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">Sender details</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{([['name','Name'],['company','Company'],['email','Email'],['phone','Phone'],['subject','Subject']] as const).map(([key,label]) => <label key={key} className="text-sm font-medium text-slate-700">{label}<input value={details[key]} onChange={e => update(key,e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-slate-500" /></label>)}<label className="text-sm font-medium text-slate-700 sm:col-span-2">Message<textarea value={details.message} onChange={e => update('message',e.target.value)} className="mt-1 min-h-32 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:border-slate-500" /></label></div></div>
      </section>
      <div className="mt-6 flex justify-end"><button disabled={sending || !urls.trim()} onClick={send} className="rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{sending ? "Processing…" : "Send to all"}</button></div>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">Results</h2>{results.length === 0 ? <p className="mt-3 text-sm text-slate-500">No submissions yet.</p> : <div className="mt-4 space-y-3">{results.map((r,i) => <div key={`${r.url}-${i}`} className="rounded-xl border border-slate-200 p-4"><div className="font-medium break-all">{r.url || "Request"}</div><div className="mt-1 text-sm font-semibold uppercase tracking-wide">{r.status.replace('_',' ')}</div><p className="mt-1 text-sm text-slate-600">{r.message}</p></div>)}</div>}</section>
    </div>
  </main>;
}
