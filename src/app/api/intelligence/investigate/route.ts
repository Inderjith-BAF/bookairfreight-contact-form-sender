import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
import { FREIGHT_INTELLIGENCE_REGIONS, FREIGHT_INTELLIGENCE_SOURCES, FREIGHT_INTELLIGENCE_TOPICS, keywordHits, topicInternalSignal } from "@/lib/freight-intelligence";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

function stripHtml(html:string){
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&")
    .replace(/\s+/g," ").trim();
}
function relevantSource(name:string, regionId:string){
  if(name.includes("Asia Pacific")) return ["au","in","nz","sg","jp","kr"].includes(regionId);
  if(name.includes("IMEA")) return ["in","ae","sa","za"].includes(regionId);
  if(name.includes("North America")) return ["us","ca","mx"].includes(regionId);
  return true;
}
function snippet(text:string,hits:string[]){
  if(!hits.length)return "";
  const at=text.toLowerCase().indexOf(hits[0].toLowerCase());
  return at<0?"":text.slice(Math.max(0,at-180),Math.min(text.length,at+520)).replace(/\s+/g," ").trim();
}
export async function POST(request:Request){
  const auth=await requireOutboundUser(request);
  if("error" in auth)return auth.error;
  const body=await request.json().catch(()=>({}));
  const regionId=String(body?.regionId||"");
  const topicId=String(body?.topicId||"");
  const activities=Array.isArray(body?.activities)?body.activities:[];
  const region=FREIGHT_INTELLIGENCE_REGIONS.find(r=>r.id===regionId);
  const topic=FREIGHT_INTELLIGENCE_TOPICS.find(t=>t.id===topicId);
  if(!region||!topic)return NextResponse.json({error:"A valid trade lane and intelligence topic are required."},{status:400});

  const fetched:any[]=await Promise.all(FREIGHT_INTELLIGENCE_SOURCES.filter(s=>relevantSource(s.name,region.id)).map(async source=>{
    try{
      const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),12000);
      const res=await fetch(source.url,{headers:{"user-agent":"BookAirfreight-Freight-Intelligence/1.0"},cache:"no-store",signal:controller.signal});
      clearTimeout(timer);
      const text=stripHtml(await res.text()).slice(0,60000);
      const hits=keywordHits(text,topic.keywords);
      return {source:source.name,url:source.url,ok:res.ok,hits,snippet:snippet(text,hits)};
    }catch(e){return {source:source.name,url:source.url,ok:false,hits:[],snippet:"",error:e instanceof Error?e.message:"source unavailable"};}
  }));
  const evidence=fetched.filter(x=>x.ok&&x.hits.length);
  const internal=topicInternalSignal(activities,region,topic);
  const evidenceScore=Math.min(100,evidence.length*18+(internal.mentions?Math.min(25,10+internal.responseRate*1.5):0)+(evidence.length?15:0));

  const marketFinding=evidence.length
    ? `Current source material contains evidence related to ${topic.label.toLowerCase()} on the ${region.label} destination market. The strongest recurring terms are ${Array.from(new Set(evidence.flatMap(e=>e.hits))).slice(0,6).join(", ")}.`
    : `The selected source set did not return strong keyword evidence for ${topic.label.toLowerCase()} on the ${region.label} destination market in this snapshot. This is a research gap, not proof that the issue is absent.`;
  const businessImpact=`For a business owner shipping goods from China to ${region.label}, this can affect landed cost, inventory timing, working capital or customer delivery commitments. The investigation should focus on the owner's actual shipment exposure rather than generic freight commentary.`;
  const validation=internal.mentions
    ? `BAF history contains ${internal.mentions} relevant topic mentions, ${internal.responses} responses and ${internal.positive} positive responses in the available outbound data.`
    : "No matching BAF outbound history was found for this topic and destination in the available dataset. Treat the opportunity as externally driven and validate it with a small campaign test.";

  return NextResponse.json({
    generatedAt:new Date().toISOString(),
    route:`China → ${region.label}`,
    region:region.label,
    topic:{id:topic.id,label:topic.label},
    evidenceScore,
    analysis:{
      marketFinding,
      businessImpact,
      validation,
      target: "Business owners / founders of importing, e-commerce, manufacturing, wholesale or distribution businesses shipping from China.",
      outreachAngle:topic.angles[0],
      hooks:[
        `If you're shipping from China to ${region.label}, ${topic.angles[0]} may be worth looking at before your next booking cycle.`,
        `We've been looking at ${topic.label.toLowerCase()} on the China → ${region.label} lane — the question is how much it is affecting your landed cost, inventory timing or delivery commitments.`,
        `A quick check we would make: are your next China → ${region.label} shipments exposed to this issue, and is there a practical way to reduce that exposure before it hits your customers?`
      ]
    },
    evidence:evidence.slice(0,5),
    sourceCount:fetched.filter(x=>x.ok).length
  });
}
