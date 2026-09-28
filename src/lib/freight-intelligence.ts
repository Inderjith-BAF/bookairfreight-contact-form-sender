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
  // Destination routing uses destination-specific terms. Broad umbrella terms
  // such as "North America" are intentionally excluded because they contaminate
  // multiple destination lanes.
  { id:"us", label:"United States", keywords:["usa","united states","u.s.","u.s.a.","los angeles","long beach","oakland","seattle","tacoma","savannah","new york","new jersey","ny/nj","norfolk","charleston","houston","transpacific","tpeb"] },
  { id:"au", label:"Australia", keywords:["australia","australian","sydney","melbourne","brisbane","fremantle","perth","adelaide","port botany","port kembla","australian ports","australian import"] },
  { id:"uk", label:"United Kingdom", keywords:["united kingdom","u.k.","britain","british","england","liverpool","felixstowe","southampton","tilbury","london gateway"] },
  { id:"eu", label:"Europe", keywords:["europe","european","rotterdam","antwerp","hamburg","bremerhaven","germany","netherlands","france","italy","spain","le havre","valencia","barcelona"] },
  { id:"ca", label:"Canada", keywords:["canada","canadian","vancouver","montreal","prince rupert","halifax","toronto"] },
  { id:"in", label:"India", keywords:["india","indian","indian subcontinent","nhava sheva","jnpt","mundra","chennai","tuticorin","cochin","kochi","kolkata","pipavav","hazira","vizag","krishnapatnam","icd india","indian import"] },
  { id:"ae", label:"United Arab Emirates", keywords:["uae","united arab emirates","dubai","jebel ali","abu dhabi","khalifa port"] },
  { id:"sa", label:"Saudi Arabia", keywords:["saudi","saudi arabia","jeddah","riyadh","dammam","king abdullah port"] },
  { id:"nz", label:"New Zealand", keywords:["new zealand","auckland","tauranga","christchurch"] },
  { id:"sg", label:"Singapore", keywords:["singapore","tanjong pagar","pasir panjang"] },
  { id:"jp", label:"Japan", keywords:["japan","tokyo","yokohama","osaka","kobe","nagoya"] },
  { id:"kr", label:"South Korea", keywords:["south korea","republic of korea","korea","busan","incheon","gwangyang"] },
  { id:"mx", label:"Mexico", keywords:["mexico","mexican","manzanillo","veracruz","lazaro cardenas","altamira"] },
  { id:"br", label:"Brazil", keywords:["brazil","brazilian","santos","paranagua","rio de janeiro"] },
  { id:"za", label:"South Africa", keywords:["south africa","south african","durban","cape town","ngqura","port elizabeth"] },
  // MEA is intentionally broad and is only used when the UI asks for that
  // aggregate region, not as a substitute for destination-specific evidence.
  { id:"mea", label:"Middle East & Africa", keywords:["middle east","gulf","qatar","oman","africa","hormuz"] }
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

  {id:"un-comtrade",name:"UN Comtrade",url:"https://comtradeplus.un.org/",kind:"official",priority:5},
  {id:"un-stats",name:"UN Statistics Division",url:"https://unstats.un.org/",kind:"official",priority:5},
  {id:"wco",name:"World Customs Organization",url:"https://www.wcoomd.org/",kind:"official",priority:5},
  {id:"itc-trade-map",name:"ITC Trade Map",url:"https://www.trademap.org/",kind:"official",priority:5},
  {id:"itc-market-access",name:"ITC Market Access Map",url:"https://www.macmap.org/",kind:"official",priority:4},
  {id:"unctad-port",name:"UNCTAD Transport & Logistics",url:"https://unctad.org/topic/transport-and-trade-logistics",kind:"official",priority:5},
  {id:"worldbank-logistics",name:"World Bank Logistics Performance",url:"https://lpi.worldbank.org/",kind:"official",priority:5},
  {id:"worldbank-trade-data",name:"World Bank Trade Data",url:"https://data.worldbank.org/topic/trade",kind:"official",priority:4},
  {id:"oecd-trade",name:"OECD Trade",url:"https://www.oecd.org/en/topics/trade.html",kind:"official",priority:4},
  {id:"oecd-supply-chains",name:"OECD Supply Chains",url:"https://www.oecd.org/en/topics/global-value-chains.html",kind:"official",priority:4},
  {id:"wto-trade-topics",name:"WTO Trade Topics",url:"https://www.wto.org/english/tratop_e/tratop_e.htm",kind:"official",priority:5},
  {id:"wto-news",name:"WTO News",url:"https://www.wto.org/english/news_e/news_e.htm",kind:"official",priority:4},
  {id:"fao-trade",name:"FAO Trade",url:"https://www.fao.org/faostat/en/#data/TCL",kind:"official",priority:3},
  {id:"usitc-dataweb",name:"USITC DataWeb",url:"https://dataweb.usitc.gov/",kind:"official",priority:5,regions:["us"]},
  {id:"usitc-tariff",name:"USITC Tariff Resources",url:"https://www.usitc.gov/tariff_affairs",kind:"official",priority:5,regions:["us"]},
  {id:"bea-trade",name:"US Bureau of Economic Analysis Trade",url:"https://www.bea.gov/data/intl-trade-investment/international-trade-goods-and-services",kind:"official",priority:4,regions:["us"]},
  {id:"us-ita-tradestats",name:"US International Trade Administration TradeStats",url:"https://www.trade.gov/tradestats-express",kind:"official",priority:4,regions:["us"]},
  {id:"fmc",name:"US Federal Maritime Commission",url:"https://www.fmc.gov/",kind:"official",priority:5,regions:["us"]},
  {id:"marad",name:"US Maritime Administration",url:"https://www.maritime.dot.gov/",kind:"official",priority:4,regions:["us"]},
  {id:"port-of-savannah",name:"Port of Savannah",url:"https://gaports.com/",kind:"official",priority:4,regions:["us"]},
  {id:"port-of-ny-nj",name:"Port of New York & New Jersey",url:"https://www.portauthority.ny.gov/ports/port-new-york-and-new-jersey",kind:"official",priority:4,regions:["us"]},
  {id:"port-of-seattle",name:"Port of Seattle",url:"https://www.portseattle.org/page/maritime-statistics",kind:"official",priority:4,regions:["us"]},
  {id:"statcan-trade",name:"Statistics Canada Trade",url:"https://www.statcan.gc.ca/en/subjects-start/international-trade",kind:"official",priority:5,regions:["ca"]},
  {id:"cbsa-trade",name:"Canada Border Services Agency",url:"https://www.cbsa-asfc.gc.ca/import/menu-eng.html",kind:"official",priority:5,regions:["ca"]},
  {id:"transport-canada",name:"Transport Canada Marine",url:"https://tc.canada.ca/en/marine-transportation",kind:"official",priority:4,regions:["ca"]},
  {id:"port-vancouver",name:"Port of Vancouver",url:"https://www.portvancouver.com/about-us/statistics/",kind:"official",priority:4,regions:["ca"]},
  {id:"hmrc-trade",name:"HMRC UK Trade Statistics",url:"https://www.gov.uk/government/collections/uk-trade-in-numbers",kind:"official",priority:5,regions:["uk"]},
  {id:"uk-trade-info",name:"UK Trade Info",url:"https://www.uktradeinfo.com/",kind:"official",priority:5,regions:["uk"]},
  {id:"uk-dft",name:"UK Department for Transport",url:"https://www.gov.uk/government/organisations/department-for-transport",kind:"official",priority:4,regions:["uk"]},
  {id:"port-felixstowe",name:"Port of Felixstowe",url:"https://www.portoffelixstowe.co.uk/",kind:"official",priority:4,regions:["uk"]},
  {id:"eurostat-trade",name:"Eurostat International Trade",url:"https://ec.europa.eu/eurostat/web/international-trade-in-goods",kind:"official",priority:5,regions:["eu"]},
  {id:"eu-taxation-customs",name:"EU Taxation & Customs",url:"https://taxation-customs.ec.europa.eu/",kind:"official",priority:5,regions:["eu"]},
  {id:"eu-mobility",name:"European Commission Mobility & Transport",url:"https://transport.ec.europa.eu/",kind:"official",priority:4,regions:["eu"]},
  {id:"port-rotterdam",name:"Port of Rotterdam",url:"https://www.portofrotterdam.com/en/port-future/port-facts-and-figures",kind:"official",priority:5,regions:["eu"]},
  {id:"port-antwerp",name:"Port of Antwerp-Bruges",url:"https://www.portofantwerpbruges.com/en/our-port/facts-figures",kind:"official",priority:5,regions:["eu"]},
  {id:"port-hamburg",name:"Port of Hamburg Statistics",url:"https://www.hafen-hamburg.de/en/statistics/",kind:"official",priority:4,regions:["eu"]},
  {id:"abs-trade",name:"Australian Bureau of Statistics Trade",url:"https://www.abs.gov.au/statistics/economy/international-trade",kind:"official",priority:5,regions:["au"]},
  {id:"abs-trade-goods",name:"Australian International Trade in Goods",url:"https://www.abs.gov.au/statistics/economy/international-trade/international-trade-goods",kind:"official",priority:5,regions:["au"]},
  {id:"abf-imports",name:"Australian Border Force Importing",url:"https://www.abf.gov.au/importing-exporting-and-manufacturing/importing",kind:"official",priority:5,regions:["au"]},
  {id:"infrastructure-australia",name:"Infrastructure Australia",url:"https://www.infrastructureaustralia.gov.au/",kind:"official",priority:4,regions:["au"]},
  {id:"port-melbourne",name:"Port of Melbourne",url:"https://www.portofmelbourne.com/about-us/statistics/",kind:"official",priority:4,regions:["au"]},
  {id:"port-botany",name:"NSW Ports",url:"https://www.nswports.com.au/",kind:"official",priority:4,regions:["au"]},
  {id:"port-brisbane",name:"Port of Brisbane",url:"https://www.portbris.com.au/",kind:"official",priority:4,regions:["au"]},
  {id:"dgft",name:"India Directorate General of Foreign Trade",url:"https://www.dgft.gov.in/",kind:"official",priority:5,regions:["in"]},
  {id:"icegate",name:"ICEGATE Customs India",url:"https://www.icegate.gov.in/",kind:"official",priority:5,regions:["in"]},
  {id:"cbic",name:"India Central Board of Indirect Taxes & Customs",url:"https://www.cbic.gov.in/",kind:"official",priority:5,regions:["in"]},
  {id:"india-trade-analytics",name:"India Trade Intelligence & Analytics",url:"https://trade-analytics.commerce.gov.in/",kind:"official",priority:4,regions:["in"]},
  {id:"indian-ports",name:"India Ports Association",url:"https://www.ipa.nic.in/",kind:"official",priority:4,regions:["in"]},
  {id:"jnport",name:"Jawaharlal Nehru Port Authority",url:"https://www.jnport.gov.in/",kind:"official",priority:4,regions:["in"]},
  {id:"china-gacc",name:"China Customs / GACC",url:"http://english.customs.gov.cn/",kind:"official",priority:5},
  {id:"china-mofcom",name:"China Ministry of Commerce",url:"http://english.mofcom.gov.cn/",kind:"official",priority:5},
  {id:"china-stats",name:"China National Bureau of Statistics",url:"https://www.stats.gov.cn/english/",kind:"official",priority:5},
  {id:"japan-customs",name:"Japan Customs",url:"https://www.customs.go.jp/english/",kind:"official",priority:5,regions:["jp"]},
  {id:"japan-meti",name:"Japan METI",url:"https://www.meti.go.jp/english/",kind:"official",priority:4,regions:["jp"]},
  {id:"korea-customs",name:"Korea Customs Service",url:"https://www.customs.go.kr/english/main.do",kind:"official",priority:5,regions:["kr"]},
  {id:"k-stat",name:"K-Stat Trade Statistics",url:"https://stat.kita.net/",kind:"official",priority:4,regions:["kr"]},
  {id:"port-busan",name:"Busan Port Authority",url:"https://www.busanpa.com/eng/",kind:"official",priority:4,regions:["kr"]},
  {id:"nz-stats-trade",name:"Stats NZ International Trade",url:"https://www.stats.govt.nz/topics/international-trade/",kind:"official",priority:5,regions:["nz"]},
  {id:"nz-customs",name:"New Zealand Customs",url:"https://www.customs.govt.nz/",kind:"official",priority:5,regions:["nz"]},
  {id:"port-auckland",name:"Port of Auckland",url:"https://www.poal.co.nz/",kind:"official",priority:4,regions:["nz"]},
  {id:"uae-fcsc",name:"UAE Federal Competitiveness & Statistics Centre",url:"https://fcsc.gov.ae/",kind:"official",priority:5,regions:["ae"]},
  {id:"dubai-customs",name:"Dubai Customs",url:"https://www.dubaicustoms.gov.ae/",kind:"official",priority:5,regions:["ae"]},
  {id:"dp-world",name:"DP World",url:"https://www.dpworld.com/",kind:"industry",priority:4,regions:["ae"]},
  {id:"sa-zatca",name:"Saudi ZATCA",url:"https://zatca.gov.sa/en/",kind:"official",priority:5,regions:["sa"]},
  {id:"sa-gastat",name:"Saudi General Authority for Statistics",url:"https://www.stats.gov.sa/en",kind:"official",priority:5,regions:["sa"]},
  {id:"mawani",name:"Saudi Ports Authority",url:"https://mawani.gov.sa/en-us",kind:"official",priority:4,regions:["sa"]},
  {id:"brazil-comex",name:"Brazil Comex Stat",url:"https://comexstat.mdic.gov.br/en/home",kind:"official",priority:5,regions:["br"]},
  {id:"brazil-mdic",name:"Brazil Ministry of Development Industry Trade",url:"https://www.gov.br/mdic/en",kind:"official",priority:4,regions:["br"]},
  {id:"port-santos",name:"Port of Santos",url:"https://www.portodesantos.com.br/en/",kind:"official",priority:4,regions:["br"]},
  {id:"mexico-sat",name:"Mexico SAT",url:"https://www.sat.gob.mx/",kind:"official",priority:5,regions:["mx"]},
  {id:"mexico-inegi",name:"INEGI Mexico Trade",url:"https://www.inegi.org.mx/temas/balanza/",kind:"official",priority:5,regions:["mx"]},
  {id:"port-manzanillo",name:"Port of Manzanillo Mexico",url:"https://www.puertomanzanillo.com.mx/",kind:"official",priority:3,regions:["mx"]},
  {id:"sars-customs",name:"South African Revenue Service Customs",url:"https://www.sars.gov.za/customs-and-excise/",kind:"official",priority:5,regions:["za"]},
  {id:"stats-sa",name:"Statistics South Africa",url:"https://www.statssa.gov.za/",kind:"official",priority:5,regions:["za"]},
  {id:"transnet",name:"Transnet Ports",url:"https://www.transnet.net/",kind:"official",priority:4,regions:["za"]},
  {id:"malaysia-stats",name:"Malaysia DOSM",url:"https://www.dosm.gov.my/",kind:"official",priority:4},
  {id:"malaysia-customs",name:"Royal Malaysian Customs",url:"https://www.customs.gov.my/en",kind:"official",priority:5},
  {id:"indonesia-bps",name:"Statistics Indonesia",url:"https://www.bps.go.id/en",kind:"official",priority:4},
  {id:"indonesia-customs",name:"Indonesia Customs",url:"https://www.beacukai.go.id/english.html",kind:"official",priority:5},
  {id:"thailand-customs",name:"Thailand Customs",url:"https://www.customs.go.th/",kind:"official",priority:5},
  {id:"vietnam-customs",name:"Vietnam Customs",url:"https://www.customs.gov.vn/",kind:"official",priority:5},
  {id:"philippines-psa",name:"Philippine Statistics Authority Foreign Trade",url:"https://psa.gov.ph/statistics/foreign-trade",kind:"official",priority:5},
  {id:"turkiye-trade",name:"Türkiye Ministry of Trade",url:"https://www.trade.gov.tr/",kind:"official",priority:5},
  {id:"turkiye-tuik",name:"TÜİK",url:"https://data.tuik.gov.tr/",kind:"official",priority:4},
  {id:"chile-customs",name:"Chile Customs",url:"https://www.aduana.cl/",kind:"official",priority:4},
  {id:"argentina-indec",name:"Argentina INDEC",url:"https://www.indec.gob.ar/",kind:"official",priority:4},
  {id:"colombia-dane",name:"Colombia DANE",url:"https://www.dane.gov.co/",kind:"official",priority:4},
  {id:"peru-sunat",name:"Peru SUNAT Customs",url:"https://www.sunat.gob.pe/",kind:"official",priority:4},
  {id:"panama-maritime",name:"Panama Maritime Authority",url:"https://www.amp.gob.pa/",kind:"official",priority:4},
  {id:"asean-stats",name:"ASEAN Statistics",url:"https://www.aseanstats.org/",kind:"official",priority:4},
  {id:"apec",name:"APEC Trade & Investment",url:"https://www.apec.org/",kind:"official",priority:4},
  {id:"ics",name:"International Chamber of Shipping",url:"https://www.ics-shipping.org/",kind:"industry",priority:4},
  {id:"wsc",name:"World Shipping Council",url:"https://www.worldshipping.org/",kind:"industry",priority:4},
  {id:"fiata",name:"FIATA",url:"https://fiata.org/",kind:"industry",priority:4},
  {id:"freightwaves",name:"FreightWaves",url:"https://www.freightwaves.com/",kind:"news",priority:4},
  {id:"supply-chain-dive",name:"Supply Chain Dive",url:"https://www.supplychaindive.com/",kind:"news",priority:3},
  {id:"logistics-manager",name:"Logistics Manager",url:"https://www.logisticsmanager.com/",kind:"news",priority:3},
  {id:"american-shipper",name:"American Shipper",url:"https://www.americanshipper.com/",kind:"news",priority:3},
  {id:"inbound-logistics",name:"Inbound Logistics",url:"https://www.inboundlogistics.com/",kind:"news",priority:3},
];

export function escapedKeyword(keyword:string){
  return keyword.toLowerCase().trim().replace(/[.*+?^$\{\}()|[\]\\]/g,"\\$&");
}

export function keywordHits(text:string, keywords:readonly string[]) {
  const lower = text.toLowerCase();
  return keywords.filter(k => {
    const value=escapedKeyword(k);
    if(!value)return false;
    return new RegExp(`(^|\\W)${value}(?=\\W|$)`,"i").test(lower);
  });
}

export function regionEvidenceHits(text:string, region:any) {
  return keywordHits(text, region.keywords || []);
}

export function routeEvidenceScore(text:string, region:any, topic:any) {
  const topicHits = keywordHits(text, topic.keywords);
  const regionHits = regionEvidenceHits(text, region);
  const originHits = keywordHits(text, ["china","chinese","shanghai","ningbo","shenzhen","yantian","shekou","qingdao","xiamen"]);
  return {
    topicHits,
    regionHits,
    originHits,
    routeSpecific: topicHits.length > 0 && regionHits.length > 0 && originHits.length > 0
  };
}

export function topicInternalSignal(activities:any[], region:any, topic:any) {
  let outreach=0, responses=0, positive=0, mentions=0;
  for (const a of activities) {
    const regionText=String(a.region||"").toLowerCase();
    if (!keywordHits(regionText, region.keywords).length) continue;
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
