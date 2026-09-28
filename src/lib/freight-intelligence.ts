export type FreightSource = {
  id:string;
  name:string;
  url:string;
  kind:"official"|"index"|"carrier"|"industry"|"news"|"air";
  priority:number;
  regions?:readonly string[];
};

export const FREIGHT_INTELLIGENCE_TOPICS = [
  { id: "cost", label: "Freight cost & rate volatility", keywords: ["freight rate","freight rates","spot rate","pricing","surcharge","fuel","bunker","cost","index"], angles: ["rate visibility before the next booking cycle","controlling landed freight cost","planning around rate volatility"] },
  { id: "capacity", label: "Capacity & space availability", keywords: ["capacity","space","allocation","blank sailing","equipment","container availability","orderbook","fleet"], angles: ["securing space before the next peak window","capacity planning for upcoming shipments","reducing rolled-cargo risk"] },
  { id: "reliability", label: "Transit reliability & delays", keywords: ["schedule reliability","delay","delays","transit time","dwell","on-time","reliability","disruption","late"], angles: ["protecting delivery commitments when schedules move","building realistic transit buffers","reducing schedule uncertainty"] },
  { id: "congestion", label: "Port & terminal congestion", keywords: ["port congestion","congestion","berth","terminal","yard","queue","port disruption","anchorage","dwell"], angles: ["planning around port congestion","reducing dwell and missed cut-off risk","choosing alternatives when gateways tighten"] },
  { id: "routing", label: "Routing & disruption planning", keywords: ["suez","panama","red sea","hormuz","rerouting","route","diversion","alternative routing","chokepoint","canal"], angles: ["contingency planning for disrupted routes","evaluating alternate gateways","reducing exposure to route disruption"] },
  { id: "trade", label: "Tariffs, customs & trade changes", keywords: ["tariff","tariffs","customs","duty","trade policy","regulation","compliance","trade rules","import duty","sanctions"], angles: ["planning landed cost around trade changes","reducing customs and compliance surprises","reviewing origin and documentation exposure"] },
  { id: "peak", label: "Peak-season & holiday planning", keywords: ["peak season","golden week","q4","holiday","pre-holiday","booking early","seasonal","christmas","new year"], angles: ["getting Q4 cargo planned before capacity tightens","protecting inventory around holiday shutdowns","booking ahead of seasonal pressure"] },
  { id: "visibility", label: "Shipment visibility & planning", keywords: ["visibility","tracking","inventory","planning","forecast","supply chain visibility","exception"], angles: ["improving shipment visibility for planning","giving teams earlier exception signals","connecting freight decisions to inventory planning"] },
  { id: "air", label: "Air-freight contingency", keywords: ["air cargo","air freight","air capacity","jet fuel","air shipment","airfreight","cargo demand"], angles: ["using air as a contingency for time-critical cargo","comparing air and ocean options","protecting urgent inventory when ocean timing slips"] }
] as const;

export const FREIGHT_INTELLIGENCE_REGIONS = [
  { id:"us", label:"United States", keywords:["usa","us","united states","north america","transpacific","tpeb"] },
  { id:"au", label:"Australia", keywords:["australia","oceania","australian"] },
  { id:"uk", label:"United Kingdom", keywords:["uk","united kingdom","britain","british","north europe"] },
  { id:"eu", label:"Europe", keywords:["europe","european","north europe","rotterdam","antwerp","germany","netherlands","france","italy","spain"] },
  { id:"ca", label:"Canada", keywords:["canada","canadian"] },
  { id:"in", label:"India", keywords:["india","indian subcontinent","nhava sheva","mundra","colombo","isc"] },
  { id:"ae", label:"United Arab Emirates", keywords:["uae","united arab emirates","dubai","jebel ali","abu dhabi"] },
  { id:"sa", label:"Saudi Arabia", keywords:["saudi","saudi arabia","jeddah","riyadh"] },
  { id:"nz", label:"New Zealand", keywords:["new zealand"] },
  { id:"sg", label:"Singapore", keywords:["singapore"] },
  { id:"jp", label:"Japan", keywords:["japan","tokyo","yokohama"] },
  { id:"kr", label:"South Korea", keywords:["south korea","korea","busan"] },
  { id:"mx", label:"Mexico", keywords:["mexico","mexican"] },
  { id:"br", label:"Brazil", keywords:["brazil","brazilian"] },
  { id:"za", label:"South Africa", keywords:["south africa","durban","cape town"] },
  { id:"mea", label:"Middle East & Africa", keywords:["middle east","gulf","uae","dubai","saudi","qatar","oman","africa","hormuz","jebel ali"] }
] as const;

export const FREIGHT_INTELLIGENCE_LANES = [
  { id:"cn-us", origin:"China", destination:"United States", label:"China → United States", regionId:"us" },
  { id:"cn-au", origin:"China", destination:"Australia", label:"China → Australia", regionId:"au" },
  { id:"cn-uk", origin:"China", destination:"United Kingdom", label:"China → United Kingdom", regionId:"uk" },
  { id:"cn-eu", origin:"China", destination:"Europe", label:"China → Europe", regionId:"eu" },
  { id:"cn-ca", origin:"China", destination:"Canada", label:"China → Canada", regionId:"ca" },
  { id:"cn-in", origin:"China", destination:"India", label:"China → India", regionId:"in" },
  { id:"cn-ae", origin:"China", destination:"United Arab Emirates", label:"China → UAE", regionId:"ae" },
  { id:"cn-sa", origin:"China", destination:"Saudi Arabia", label:"China → Saudi Arabia", regionId:"sa" },
  { id:"cn-nz", origin:"China", destination:"New Zealand", label:"China → New Zealand", regionId:"nz" },
  { id:"cn-sg", origin:"China", destination:"Singapore", label:"China → Singapore", regionId:"sg" },
  { id:"cn-jp", origin:"China", destination:"Japan", label:"China → Japan", regionId:"jp" },
  { id:"cn-kr", origin:"China", destination:"South Korea", label:"China → South Korea", regionId:"kr" },
  { id:"cn-mx", origin:"China", destination:"Mexico", label:"China → Mexico", regionId:"mx" },
  { id:"cn-br", origin:"China", destination:"Brazil", label:"China → Brazil", regionId:"br" },
  { id:"cn-za", origin:"China", destination:"South Africa", label:"China → South Africa", regionId:"za" }
] as const;

/*
 * Broad source registry. Some providers publish free public summaries while others
 * expose premium datasets. We monitor the public surface here and keep premium
 * providers in the registry so the engine can be extended with API credentials later.
 */
export const FREIGHT_INTELLIGENCE_SOURCES:readonly FreightSource[] = [
  {id:"dhl-ocean",name:"DHL Ocean Freight Market Update",url:"https://www.dhl.com/us-en/home/global-forwarding/latest-news-and-webinars/ocean-freight-market-update.html",kind:"carrier",priority:5},
  {id:"freightos-outlook",name:"Freightos Global Freight Outlook",url:"https://www.freightos.com/freight-resources/freightos-global-freight-outlook-september-2026/",kind:"index",priority:5},
  {id:"freightos-trends",name:"Freightos Freight Trends",url:"https://www.freightos.com/freight-resources/trends/",kind:"index",priority:5},
  {id:"freightos-fbx",name:"Freightos Baltic Index",url:"https://www.freightos.com/enterprise/terminal/freightos-baltic-index-global-container-pricing-index/",kind:"index",priority:5},
  {id:"flexport-glu",name:"Flexport Global Logistics Update",url:"https://www.flexport.com/global-logistics-update/",kind:"industry",priority:5},
  {id:"maersk-apac",name:"Maersk Asia Pacific Market Update",url:"https://www.maersk.com/zh-tw/news/articles/2026/09/09/maersk-asia-pacific-market-update-september",kind:"carrier",priority:5,regions:["au","in","nz","sg","jp","kr"]},
  {id:"maersk-imea",name:"Maersk India Middle East & Africa Market Update",url:"https://www.maersk.com/news/articles/2026/09/09/india-middle-east-and-africa-market-update-september",kind:"carrier",priority:5,regions:["in","ae","sa","za","mea"]},
  {id:"maersk-na",name:"Maersk North America Market Update",url:"https://www.maersk.com/news/articles/2026/09/09/north-america-market-update-september",kind:"carrier",priority:5,regions:["us","ca","mx"]},
  {id:"maersk-market",name:"Maersk Market Updates",url:"https://www.maersk.com/news/tags/market-update",kind:"carrier",priority:4},
  {id:"unctad-maritime",name:"UNCTAD Review of Maritime Transport",url:"https://unctad.org/topic/transport-and-trade-logistics/review-of-maritime-transport",kind:"official",priority:5},
  {id:"wto-tariff",name:"WTO-IMF Tariff Tracker",url:"https://ttd.wto.org/en/reports/tariff-actions",kind:"official",priority:5},
  {id:"wto-trade-data",name:"WTO Tariff & Trade Data",url:"https://data.wto.org/dataset/wto_ttd",kind:"official",priority:5},
  {id:"imf-portwatch",name:"IMF PortWatch",url:"https://portwatch.imf.org/",kind:"official",priority:5},
  {id:"imf-portwatch-monitor",name:"IMF PortWatch Trade Monitor",url:"https://data-download.imf.org/ClimateData/portwatch-monitor.html",kind:"official",priority:5},
  {id:"worldbank-stress",name:"World Bank Global Supply Chain Stress Index",url:"https://www.worldbank.org/en/data/interactive/2025/04/08/global-supply-chain-stress-index",kind:"official",priority:5},
  {id:"worldbank-cppi",name:"World Bank Container Port Performance Index",url:"https://www.worldbank.org/en/programs/icp/brief/container-port-performance-index-cppi",kind:"official",priority:4},
  {id:"bts-freight",name:"US Bureau of Transportation Statistics Freight Indicators",url:"https://www.bts.gov/freight-indicators",kind:"official",priority:5,regions:["us"]},
  {id:"census-trade",name:"US Census Foreign Trade",url:"https://www.census.gov/foreign-trade/index.html",kind:"official",priority:4,regions:["us"]},
  {id:"iata-cargo",name:"IATA Cargo Data",url:"https://www.iata.org/en/services/data/cargo/",kind:"air",priority:5},
  {id:"drewry-research",name:"Drewry Maritime Research",url:"https://www.drewry.co.uk/maritime-research",kind:"industry",priority:5},
  {id:"drewry-signals",name:"Drewry Container Shipping Market Signals",url:"https://www.drewry.co.uk/news/drewry-launches-container-shipping-market-signals-dashboard",kind:"industry",priority:5},
  {id:"xeneta-ocean",name:"Xeneta Ocean Market Intelligence",url:"https://www.xeneta.com/products/ocean",kind:"index",priority:5},
  {id:"sea-intelligence",name:"Sea-Intelligence Maritime Data & Analysis",url:"https://www.sea-intelligence.com/",kind:"industry",priority:5},
  {id:"container-news",name:"Container News",url:"https://container-news.com/news/",kind:"news",priority:3},
  {id:"container-news-market",name:"Container News Market Insights",url:"https://container-news.com/market-insights/",kind:"news",priority:3},
  {id:"joc",name:"Journal of Commerce",url:"https://www.joc.com/",kind:"news",priority:3},
  {id:"loadstar",name:"The Loadstar",url:"https://theloadstar.com/",kind:"news",priority:3},
  {id:"splash247",name:"Splash247",url:"https://splash247.com/",kind:"news",priority:3},
  {id:"lloyds-list",name:"Lloyd's List",url:"https://www.lloydslist.com/",kind:"news",priority:3},
  {id:"tac-index",name:"TAC Index Air Freight",url:"https://www.tacindex.com/",kind:"air",priority:4},
  {id:"imo",name:"International Maritime Organization",url:"https://www.imo.org/en/MediaCentre/HotTopics/Pages/default.aspx",kind:"official",priority:5},
  {id:"world-bank-trade",name:"World Bank Trade",url:"https://www.worldbank.org/en/topic/trade",kind:"official",priority:4},
  {id:"oecd-trade",name:"OECD International Trade",url:"https://www.oecd.org/en/topics/international-trade.html",kind:"official",priority:4},
  {id:"unctad-stat",name:"UNCTAD Data Hub",url:"https://unctadstat.unctad.org/",kind:"official",priority:4},
  {id:"ec-trade",name:"European Commission Trade",url:"https://policy.trade.ec.europa.eu/",kind:"official",priority:4,regions:["eu"]},
  {id:"ustr",name:"US Trade Representative",url:"https://ustr.gov/",kind:"official",priority:5,regions:["us"]},
  {id:"cbp",name:"US Customs and Border Protection",url:"https://www.cbp.gov/trade",kind:"official",priority:5,regions:["us"]},
  {id:"canada-trade",name:"Canada Trade Data",url:"https://international.canada.ca/en/services/business-trade-statistics-data",kind:"official",priority:4,regions:["ca"]},
  {id:"austrade",name:"Austrade Trade",url:"https://www.austrade.gov.au/en/news-and-analysis",kind:"official",priority:4,regions:["au"]},
  {id:"uk-trade",name:"UK Department for Business and Trade",url:"https://www.gov.uk/government/organisations/department-for-business-and-trade",kind:"official",priority:4,regions:["uk"]},
  {id:"india-commerce",name:"India Department of Commerce",url:"https://www.commerce.gov.in/",kind:"official",priority:4,regions:["in"]},
  {id:"singapore-mpa",name:"Maritime and Port Authority of Singapore",url:"https://www.mpa.gov.sg/",kind:"official",priority:4,regions:["sg"]},
  {id:"port-of-la",name:"Port of Los Angeles",url:"https://www.portoflosangeles.org/business/statistics",kind:"official",priority:4,regions:["us"]},
  {id:"port-of-long-beach",name:"Port of Long Beach",url:"https://polb.com/business/port-statistics/",kind:"official",priority:4,regions:["us"]},
  {id:"port-of-oakland",name:"Port of Oakland",url:"https://www.portofoakland.com/performance/statistics/",kind:"official",priority:3,regions:["us"]},
];

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
