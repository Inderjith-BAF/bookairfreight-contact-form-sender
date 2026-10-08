import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";

export const runtime="nodejs";

export async function POST(request:Request){
 const auth=await requireOutboundUser(request);
 if("error" in auth)return auth.error;
 const {admin,profile}=auth;
 const body=await request.json().catch(()=>null);
 const campaignId=String(body?.campaignId||"");
 if(!campaignId)return NextResponse.json({error:"Campaign ID is required."},{status:400});
 const {data:campaign,error}=await admin.from("mail_merge_campaigns").select("id,created_by,status").eq("id",campaignId).maybeSingle();
 if(error||!campaign)return NextResponse.json({error:error?.message||"Campaign not found."},{status:404});
 if(profile.role==="member"&&campaign.created_by!==profile.id)return NextResponse.json({error:"Not authorized."},{status:403});
 return NextResponse.json({
  error:"Direct browser sending is disabled. This campaign is handled by the automatic domain dispatcher.",
  status:campaign.status,
  message:"Dispatch queues the campaign and the backend releases approximately one domain email every 30-60 seconds. The browser does not need to remain open."
 },{status:409});
}
