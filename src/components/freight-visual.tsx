export function FreightVisual() {
  return <div className="relative mx-auto h-44 w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60">
    <div className="absolute inset-0 freight-grid opacity-80" />
    <div className="absolute left-1/2 top-1/2 h-px w-[140%] -translate-x-1/2 bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
    <div className="float-slow absolute left-[9%] top-10 text-5xl">✈️</div>
    <div className="float-fast absolute right-[10%] top-7 text-5xl">🚢</div>
    <div className="absolute bottom-7 left-[27%] text-4xl">🚚</div>
    <div className="absolute bottom-8 right-[29%] h-9 w-20 rounded-md border border-lime-300/40 bg-lime-300/10" />
    <div className="absolute bottom-3 left-0 h-px w-full bg-white/10" />
    <div className="scan absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-transparent via-lime-300/80 to-transparent" />
    <div className="absolute bottom-3 left-4 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] font-bold uppercase tracking-[.25em] text-slate-400">air • ocean • road</div>
  </div>;
}
