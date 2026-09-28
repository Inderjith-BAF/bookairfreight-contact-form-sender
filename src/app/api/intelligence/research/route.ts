import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireOutboundUser } from "@/lib/outbound-auth";
import { FREIGHT_INTELLIGENCE_REGIONS, FREIGHT_INTELLIGENCE_SOURCES, FREIGHT_INTELLIGENCE_TOPICS, keywordHits, routeEvidenceScore, topicInternalSignal } from "@/lib/freight-intelligence";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

function stripHtml(html:string){
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi," ")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi," ")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/g," ")
    .replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'")
    .replace(/\s+/g," ")
    .trim();
}

function hashText(text:string){ return createHash("sha256").update(text).digest("hex"); }

function relevantSource(source:any, region:any){
  return !source.regions || source.regions.includes(region.id);
}

function evidenceSnippet(text:string,hits:string[]){
  if(!hits.length)return "";
  const lower=text.toLowerCase();
  const hit=hits[0].toLowerCase();
  const at=lower.indexOf(hit);
  if(at<0)return "";
  return text.slice(Math.max(0,at-180),Math.min(text.length,at+520)).replace(/\s+/g," ").trim();
}

function extractPageDate(html:string,text:string){
  const meta=html.match(/(?:article:published_time|datePublished|dateModified)[^>]*content=["']([^"']+)["']/i);
  if(meta?.[1])return meta[1];
  return text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0]||null;
}

async function fetchSource(source:any){
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    const res=await fetch(source.url,{
      headers:{
        "user-agent":"BookAirfreight-Outbound-Intelligence/2.0",
        "accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      cache:"no-store",
      signal:controller.signal
    });
    clearTimeout(timeout);
    const html=await res.text();
    const text=stripHtml(html).slice(0,60000);
    return {id:source.id,name:source.name,url:source.url,kind:source.kind,priority:source.priority,
      ok:res.ok,status:res.status,checkedAt:new Date().toISOString(),chars:text.length,
      hash:hashText(text),publishedAt:extractPageDate(html,text),text};
  }catch(e){
    return {id:source.id,name:source.name,url:source.url,kind:source.kind,priority:source.priority,
      ok:false,status:0,checkedAt:new Date().toISOString(),chars:0,hash:"",publishedAt:null,text:"",
      error:e instanceof Error?e.message:"source unavailable"};
  }
}

function topicScore(evidence:any[],internal:any){
  const authority=evidence.reduce((sum,e)=>sum+Math.min(5,Number(e.priority||1)),0);
  const sourceDiversity=new Set(evidence.map(e=>e.kind)).size;
  const marketScore=Math.min(55,evidence.length*8+authority*2+Math.max(0,sourceDiversity-1)*4);
  const internalScore=internal.mentions?Math.min(35,8+internal.responseRate*1.5+Math.min(18,internal.positive*1.5)):0;
  const confidenceBonus=evidence.length>=3?10:evidence.length>=1?5:0;
  return Math.min(100,Math.round(marketScore+internalScore+confidenceBonus));
}

async function optionalAiSynthesis(payload:any){
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey)return null;
  const model=process.env.OPENAI_INTELLIGENCE_MODEL||"gpt-5.6";
  const prompt=[
    "You are the senior freight-market research analyst for BookAirfreight.",
    "Synthesize the supplied multi-source evidence into decision-grade market intelligence.",
    "Do not invent facts. Distinguish source evidence from inference. Prefer consensus across independent sources.",
    "Return JSON with keys: executiveSummary, whatChanged, marketImplications, buyerImplications, prioritySignals, researchGaps.",
    "prioritySignals must be an array of objects with topic, whyItMatters, confidence, supportingSources.",
    JSON.stringify(payload)
  ].join("\n");
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
      body:JSON.stringify({model,input:prompt,store:false}),
      signal:AbortSignal.timeout(25000)
    });
    if(!response.ok)return null;
    const data=await response.json();
    const raw=String(data.output_text||"").trim();
    if(!raw)return null;
    const fenced=raw.replace(/^`json\s*/i,"").replace(/\s*`$/,"");
    try{return JSON.parse(fenced);}catch{return {executiveSummary:raw,whatChanged:[],marketImplications:[],buyerImplications:[],prioritySignals:[],researchGaps:[]};}
  }catch{return null;}
}

export async function POST(request:Request){
  const auth=await requireOutboundUser(request);
  if("error" in auth)return auth.error;
  const body=await request.json().catch(()=>({}));
  const activities=Array.isArray(body?.activities)?body.activities:[];
  const ids=Array.isArray(body?.regions)?body.regions.map(String):FREIGHT_INTELLIGENCE_REGIONS.map(r=>r.id);
  const regions=FREIGHT_INTELLIGENCE_REGIONS.filter(r=>ids.includes(r.id));
  const admin=auth.admin;

  const sourceResults:any[]=await Promise.all(FREIGHT_INTELLIGENCE_SOURCES.map(fetchSource));
  const sourceIds=FREIGHT_INTELLIGENCE_SOURCES.map(s=>s.id);
  const {data:previousSnapshots}=await admin.from("outbound_intelligence_source_snapshots")
    .select("source_id,checked_at,content_hash,chars,ok").in("source_id",sourceIds)
    .order("checked_at",{ascending:false}).limit(sourceIds.length*2);

  const previousBySource=new Map<string,any>();
  for(const row of previousSnapshots||[])if(!previousBySource.has(row.source_id))previousBySource.set(row.source_id,row);

  const sourceResultsWithChange=sourceResults.map(s=>{
    const previous=previousBySource.get(s.id);
    return {...s,isNew:!previous,changed:!!s.ok&&!!s.hash&&(!previous||previous.content_hash!==s.hash),
      previousCheckedAt:previous?.checked_at||null,previousChars:previous?.chars||0};
  });

  await admin.from("outbound_intelligence_source_snapshots").insert(sourceResultsWithChange.map(s=>({
    source_id:s.id,source_name:s.name,url:s.url,checked_at:s.checkedAt,ok:s.ok,status:s.status,
    content_hash:s.hash||null,chars:s.chars,
    metadata:{kind:s.kind,priority:s.priority,publishedAt:s.publishedAt,changed:s.changed,isNew:s.isNew}
  })));

  const output=regions.map(region=>{
    const sources=sourceResultsWithChange.filter(s=>s.ok&&relevantSource(s,region));
    const topics=FREIGHT_INTELLIGENCE_TOPICS.map(topic=>{
      const evidence=sources.map(s=>{
        const match=routeEvidenceScore(s.text,region,topic);
        const allowed = match.routeSpecific || (!!s.regions?.includes(region.id) && match.topicHits.length>0);
        return {
          source:s.name,url:s.url,hits:match.topicHits,snippet:evidenceSnippet(s.text,match.topicHits),
          priority:s.priority,kind:s.kind,changed:s.changed,regionHits:match.regionHits,
          originHits:match.originHits,routeSpecific:match.routeSpecific,allowed
        };
      }).filter(x=>x.allowed);
      const internal=topicInternalSignal(activities,region,topic);
      return {id:topic.id,label:topic.label,evidenceScore:topicScore(evidence,internal),
        marketSources:evidence.length,routeSpecificSources:evidence.filter(e=>e.routeSpecific).length,changedSources:evidence.filter(e=>e.changed).length,
        sourceTypes:new Set(evidence.map(e=>e.kind)).size,internal,
        angle:"Lead with "+topic.angles[0]+" and make the outreach specific to the business owner's China-origin lane, shipment timing, inventory exposure or landed-cost concern.",
        evidence:evidence.sort((a,b)=>Number(b.changed)-Number(a.changed)||b.priority-a.priority).slice(0,6)
          .map(x=>({source:x.source,url:x.url,hits:x.hits.slice(0,8),snippet:x.snippet,changed:x.changed,kind:x.kind}))};
    }).sort((a,b)=>b.evidenceScore-a.evidenceScore||b.marketSources-a.marketSources).slice(0,5);
    const signals=sources.flatMap(s=>FREIGHT_INTELLIGENCE_TOPICS.map(t=>{
      const match=routeEvidenceScore(s.text,region,t);
      return {source:s.name,url:s.url,topic:t.label,hits:match.topicHits,changed:s.changed,priority:s.priority,kind:s.kind,routeSpecific:match.routeSpecific};
    }).filter(x=>x.hits.length&&x.routeSpecific)).sort((a,b)=>Number(b.changed)-Number(a.changed)||b.priority-a.priority).slice(0,20);
    return {regionId:region.id,region:region.label,sourceCount:sources.length,changedSourceCount:sources.filter(s=>s.changed).length,topics,signals};
  });

  const previousRunQuery=await admin.from("outbound_intelligence_runs").select("generated_at,result")
    .order("generated_at",{ascending:false}).limit(1).maybeSingle();
  const previousRun=previousRunQuery.data;
  const previousRegions=previousRun?.result?.regions||[];

  const changes=sourceResultsWithChange.filter(s=>s.ok&&s.changed).map(s=>({
    source:s.name,url:s.url,kind:s.kind,priority:s.priority,isNew:s.isNew,
    previousCheckedAt:s.previousCheckedAt,charsDelta:s.chars-(s.previousChars||0)
  })).sort((a,b)=>b.priority-a.priority);

  const topicDeltas=output.flatMap(region=>{
    const prevRegion=previousRegions.find((r:any)=>r.regionId===region.regionId);
    return region.topics.map((topic:any)=>{
      const previousTopic=prevRegion?.topics?.find((t:any)=>t.id===topic.id);
      return {regionId:region.regionId,region:region.region,topicId:topic.id,topic:topic.label,
        currentScore:topic.evidenceScore,previousScore:previousTopic?.evidenceScore??null,
        delta:previousTopic?topic.evidenceScore-previousTopic.evidenceScore:null,changedSources:topic.changedSources};
    });
  }).sort((a,b)=>(Math.abs(b.delta??0)-Math.abs(a.delta??0))||b.currentScore-a.currentScore);

  const deepResearchInput={generatedAt:new Date().toISOString(),previousRunAt:previousRun?.generated_at||null,
    changedSources:changes.slice(0,30),topicDeltas:topicDeltas.slice(0,40),
    regions:output.map(r=>({regionId:r.regionId,region:r.region,topics:r.topics.map((t:any)=>({
      id:t.id,label:t.label,evidenceScore:t.evidenceScore,marketSources:t.marketSources,
      changedSources:t.changedSources,internal:t.internal,evidence:t.evidence.slice(0,4)}))}))};

  const ai=await optionalAiSynthesis(deepResearchInput);
  const result={
    mode:ai?"deep-research-ai+multi-source":"deep-research-multi-source",
    generatedAt:new Date().toISOString(),previousRunAt:previousRun?.generated_at||null,
    sourceStats:{configured:FREIGHT_INTELLIGENCE_SOURCES.length,checked:sourceResultsWithChange.length,
      successful:sourceResultsWithChange.filter(s=>s.ok).length,failed:sourceResultsWithChange.filter(s=>!s.ok).length,
      changed:changes.length,newSources:changes.filter(x=>x.isNew).length},
    changes:changes.slice(0,30),topicDeltas:topicDeltas.slice(0,40),ai,regions:output,
    sources:sourceResultsWithChange.map(s=>({id:s.id,name:s.name,url:s.url,kind:s.kind,priority:s.priority,ok:s.ok,
      status:s.status,chars:s.chars,checkedAt:s.checkedAt,publishedAt:s.publishedAt,changed:s.changed,
      isNew:s.isNew,previousCheckedAt:s.previousCheckedAt,error:s.error||null}))
  };

  const {error:saveError}=await admin.from("outbound_intelligence_runs").insert({
    created_by:auth.user.id,generated_at:result.generatedAt,mode:result.mode,
    source_count:result.sourceStats.successful,changed_source_count:result.sourceStats.changed,
    failed_source_count:result.sourceStats.failed,result});
  if(saveError)console.error("Failed to save intelligence run:",saveError.message);

  return NextResponse.json(result);
}
