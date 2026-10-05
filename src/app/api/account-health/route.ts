import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:Request){const auth=await requireOutboundUser(request);if("error" in auth)return auth.error;const {admin}=auth;
const [{data:accounts,error:aErr},{data:events,error:eErr}]=await Promise.all([
 admin.from("outbound_email_accounts").select("*").order("email"),
 admin.from("mail_merge_events").select("sender_account_id,event_type,created_at,details").order("created_at",{ascending:false}).limit(5000)
]);if(aErr||eErr)return NextResponse.json({error:aErr?.message||eErr?.message},{status:500});
const now=Date.now(),day=now-86400000,week=now-7*86400000;
const rows=(accounts||[]).map((a:any)=>{const ev=(events||[]).filter((e:any)=>e.sender_account_id===a.id);const recent=ev.filter((e:any)=>new Date(e.created_at).getTime()>=day);const weekly=ev.filter((e:any)=>new Date(e.created_at).getTime()>=week);
const count=(arr:any[],types:string[])=>arr.filter(e=>types.includes(e.event_type)).length;
const attempted=count(weekly,["sent","send_attempt","provider_accepted"]),accepted=count(weekly,["provider_accepted","sent"]),failures=count(weekly,["failed","error"]),hard=count(weekly,["bounce_hard"]),soft=count(weekly,["bounce_soft"]),opens=count(weekly,["open"]),replies=count(weekly,["reply"]),unsub=count(weekly,["unsubscribe"]);
let health=a.health_status||"Healthy"; if(a.health_status==="Paused")health="Paused"; else if(failures>=5||hard>=3)health="Watch";
const authOk=Boolean(a.provider_status??true);
return {...a,metrics:{attempted,accepted,failures,hard_bounces:hard,soft_bounces:soft,opens,replies,unsubscribes:unsub,auth_ok:authOk,recent_events:recent.length,weekly_events:weekly.length},health_status:health};
});
return NextResponse.json({accounts:rows,generated_at:new Date().toISOString()});}
