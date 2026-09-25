export const FREIGHT_INTELLIGENCE_TOPICS = [
  { id: "cost", label: "Freight cost & rate volatility", keywords: ["freight rate","freight rates","spot rate","pricing","surcharge","fuel","bunker","cost"], angles: ["rate visibility before the next booking cycle","controlling landed freight cost","planning around rate volatility"] },
  { id: "capacity", label: "Capacity & space availability", keywords: ["capacity","space","allocation","blank sailing","equipment","container availability"], angles: ["securing space before the next peak window","capacity planning for upcoming shipments","reducing rolled-cargo risk"] },
  { id: "reliability", label: "Transit reliability & delays", keywords: ["schedule reliability","delay","delays","transit time","dwell","on-time","reliability","disruption"], angles: ["protecting delivery commitments when schedules move","building realistic transit buffers","reducing schedule uncertainty"] },
  { id: "congestion", label: "Port & terminal congestion", keywords: ["port congestion","congestion","berth","terminal","yard","queue","port disruption"], angles: ["planning around port congestion","reducing dwell and missed cut-off risk","choosing alternatives when gateways tighten"] },
  { id: "routing", label: "Routing & disruption planning", keywords: ["suez","panama","red sea","hormuz","rerouting","route","diversion","alternative routing"], angles: ["contingency planning for disrupted routes","evaluating alternate gateways","reducing exposure to route disruption"] },
  { id: "trade", label: "Tariffs, customs & trade changes", keywords: ["tariff","tariffs","customs","duty","trade policy","regulation","compliance","trade rules"], angles: ["planning landed cost around trade changes","reducing customs and compliance surprises","reviewing origin and documentation exposure"] },
  { id: "peak", label: "Peak-season & holiday planning", keywords: ["peak season","golden week","q4","holiday","pre-holiday","booking early","seasonal"], angles: ["getting Q4 cargo planned before capacity tightens","protecting inventory around holiday shutdowns","booking ahead of seasonal pressure"] },
  { id: "visibility", label: "Shipment visibility & planning", keywords: ["visibility","tracking","inventory","planning","forecast","supply chain visibility"], angles: ["improving shipment visibility for planning","giving teams earlier exception signals","connecting freight decisions to inventory planning"] },
  { id: "air", label: "Air-freight contingency", keywords: ["air cargo","air freight","air capacity","jet fuel","air shipment"], angles: ["using air as a contingency for time-critical cargo","comparing air and ocean options","protecting urgent inventory when ocean timing slips"] }
] as const;

export const FREIGHT_INTELLIGENCE_REGIONS = [
  { id:"us", label:"United States", keywords:["usa","us","united states","north america","transpacific","tpeb"] },
  { id:"uk", label:"United Kingdom", keywords:["uk","united kingdom","britain","british","north europe"] },
  { id:"eu", label:"Europe", keywords:["europe","european","north europe","rotterdam","antwerp","germany","netherlands","mediterranean"] },
  { id:"au", label:"Australia", keywords:["australia","oceania","australian"] },
  { id:"mea", label:"Middle East", keywords:["middle east","gulf","uae","dubai","saudi","qatar","oman","hormuz","jebel ali"] },
  { id:"in", label:"India", keywords:["india","indian subcontinent","nhava sheva","mundra","colombo","isc"] },
  { id:"apac", label:"Asia Pacific", keywords:["asia pacific","asia","china","singapore","hong kong","busan","shanghai","ningbo","golden week"] },
  { id:"ca", label:"Canada", keywords:["canada","canadian"] }
] as const;

export const FREIGHT_INTELLIGENCE_SOURCES = [
  { name:"DHL Ocean Freight Market Update", url:"https://www.dhl.com/us-en/home/global-forwarding/latest-news-and-webinars/ocean-freight-market-update.html" },
  { name:"Freightos Global Freight Outlook", url:"https://www.freightos.com/freight-resources/freightos-global-freight-outlook-september-2026/" },
  { name:"Flexport Global Logistics Update", url:"https://www.flexport.com/global-logistics-update/september-24-2026-glu-newsletter/" },
  { name:"Maersk Asia Pacific Market Update", url:"https://www.maersk.com/news/articles/2026/09/09/maersk-asia-pacific-market-update-september" },
  { name:"Maersk IMEA Market Update", url:"https://www.maersk.com/news/articles/2026/09/09/india-middle-east-and-africa-market-update-september" }
] as const;

export function keywordHits(text:string, keywords:readonly string[]) {
  const lower = text.toLowerCase();
  return keywords.filter(k => lower.includes(k.toLowerCase()));
}

export function topicInternalSignal(activities:any[], region:any, topic:any) {
  let outreach=0, responses=0, positive=0, mentions=0;
  for (const a of activities) {
    const regionText=String(a.region||"").toLowerCase();
    if (!region.keywords.some((k:string)=>regionText.includes(k))) continue;
    const text=[a.subject,a.content,a.campaign].filter(Boolean).join(" ");
    const hits=keywordHits(text,topic.keywords);
    if (!hits.length) continue;
    outreach+=Number(a.outreach_volume||0);
    responses+=Number(a.positive_replies||0)+Number(a.neutral_replies||0)+Number(a.negative_replies||0);
    positive+=Number(a.positive_replies||0);
    mentions+=hits.length;
  }
  return {outreach,responses,positive,mentions,responseRate:outreach?responses/outreach*100:0};
}
