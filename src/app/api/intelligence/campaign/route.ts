import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
import { FREIGHT_INTELLIGENCE_REGIONS, FREIGHT_INTELLIGENCE_TOPICS } from "@/lib/freight-intelligence";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
  const auth=await requireOutboundUser(request);
  if("error" in auth)return auth.error;
  const requestBody=await request.json().catch(()=>({}));
  const regionId=String(requestBody?.regionId||"");
  const topicId=String(requestBody?.topicId||"");
  const investigation=requestBody?.investigation;
  const region=FREIGHT_INTELLIGENCE_REGIONS.find(r=>r.id===regionId);
  const topic=FREIGHT_INTELLIGENCE_TOPICS.find(t=>t.id===topicId);
  if(!region||!topic||!investigation)return NextResponse.json({error:"A completed investigation is required before generating a campaign."},{status:400});

  const lane=`China → ${region.label}`;
  const owner=`business owners importing goods from China into ${region.label}`;
  const angle=String(investigation.analysis?.outreachAngle||topic.angles[0]);
  const hook=String(investigation.analysis?.hooks?.[0]||`If you're shipping from China to ${region.label}, ${angle} may be worth looking at before your next booking cycle.`);
  const campaignName=`${region.label} · ${topic.label} · Owner Outreach`;
  const subjects=[
    `${lane}: a quick freight check`,
    `Question about your ${lane.toLowerCase()} shipments`,
    `${topic.label}: worth checking before your next shipment?`
  ];
  const opening=hook;
  const emailBody=[
    opening,
    "",
    `We work with businesses moving goods from China to ${region.label}, and we're seeing enough movement around ${topic.label.toLowerCase()} to think it is worth a quick check against your upcoming shipments.`,
    "",
    `If this is relevant to you, I can take a look at the lane and see whether there is a practical way to reduce the exposure — whether that's cost, timing, routing or capacity.`,
    "",
    "Would it be useful if I looked at one of your upcoming shipments?"
  ].join("\n");
  return NextResponse.json({
    generatedAt:new Date().toISOString(),
    campaignName,
    route:lane,
    target:owner,
    painPoint:topic.label,
    angle,
    subjectLines:subjects,
    opening,
    body:emailBody,
    cta:"Would it be useful if I looked at one of your upcoming shipments?",
    nextStep:"Test this as a small outbound campaign first; use reply data to validate the angle before scaling."
  });
}
