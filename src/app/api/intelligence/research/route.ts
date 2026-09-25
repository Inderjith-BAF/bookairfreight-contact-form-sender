import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
import { FREIGHT_INTELLIGENCE_REGIONS, FREIGHT_INTELLIGENCE_SOURCES, FREIGHT_INTELLIGENCE_TOPICS, keywordHits, topicInternalSignal } from "@/lib/freight-intelligence";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

function stripHtml(html:string){return html.replace(/<script[\\s\\S]*?<\\/script>/gi," ").replace(/<style[\\s\\S]*?<\\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\\s+/g," ").trim();}
function relevantSource(name:string, region:any){ 
  if(name.includes("Asia Pacific")) return ["apac","in","au"].includes(region.id);
  if(name.includes("IMEA")) return ["in","mea"].includes(region.id);
  return true;
}
export async function POST(request:Request){
  const auth=await requireOutboundUser(request);
  if("error" in auth)return auth.error;
  const body=await request.json().catch(()=>({}));
  const activities=Array.isArray(body?.activities)?body.activities:[];
  const ids=Array.isArray(body?.regions)?body.regions.map(String):FREIGHT_INTELLIGENCE_REGIONS.map(r=>r.id);
  const regions=FREIGHT_INTELLIGENCE_REGIONS.filter(r=>ids.includes(r.id));
  const sourceResults:any[]=[];
  for(const source of FREIGHT_INTELLIGENCE_SOURCES){
    try{
      const res=await fetch(source.url,{headers:{"user-agent":"BookAirfreight-Freight-Intelligence/1.0"},cache:"no-store"});
      const html=await res.text();
      const text=stripHtml(html).slice(0,50000);
      sourceResults.push({name:source.name,url:source.url,ok:res.ok,status:res.status,checkedAt:new Date().toISOString(),chars:text.length,text});
    }catch(e){
      sourceResults.push({name:source.name,url:source.url,ok:false,error:e instanceof Error?e.message:"source unavailable",text:""});
    }
  }
  const output=regions.map(region=>{
    const sources=sourceResults.filter(s=>s.ok && relevantSource(s.name,region));
    const topics=FREIGHT_INTELLIGENCE_TOPICS.map(topic=>{
      const evidence=sources.map(s=>{
        const hits=keywordHits(s.text,topic.keywords);
        return {source:s.name,url:s.url,hits,snippet:evidenceSnippet(s.text,hits)};
      }).filter(x=>x.hits.length);
      const internal=topicInternalSignal(activities,region,topic);
      const marketScore=Math.min(45,evidence.length*15);
      const internalScore=internal.mentions?Math.min(40,10+internal.responseRate*2+Math.min(20,internal.positive*1.5)):0;
      const evidenceScore=Math.round(marketScore+internalScore+(evidence.length?15:0));
      return {id:topic.id,label:topic.label,evidenceScore,marketSources:evidence.length,internal,angle:"Lead with "+topic.angles[0]+" and make the email specific to the prospect's lane, shipment timing or inventory exposure.",evidence:evidence.slice(0,4).map(x=>({source:x.source,url:x.url,hits:x.hits.slice(0,8),snippet:x.snippet}))};
    }).sort((a,b)=>b.evidenceScore-a.evidenceScore||b.marketSources-a.marketSources).slice(0,5);
    const signals=sources.flatMap(s=>FREIGHT_INTELLIGENCE_TOPICS.map(t=>({source:s.name,url:s.url,topic:t.label,hits:keywordHits(s.text,t.keywords)})).filter(x=>x.hits.length)).slice(0,12);
    return {regionId:region.id,region:region.label,sourceCount:sources.length,topics,signals};
  });
  return NextResponse.json({mode:"deterministic-market-research",generatedAt:new Date().toISOString(),regions:output,sources:sourceResults.map(s=>({...s,text:undefined}))});
}
