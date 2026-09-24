import { NextResponse } from "next/server";
import { z } from "zod";
import { submitContactForm } from "@/lib/form-engine";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SenderDetails } from "@/types/submission";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

const MAX_UNIQUE_TARGETS=25;

const schema=z.object({
  urls:z.array(z.string().url()).min(1).max(25),
  details:z.object({
    firstName:z.string().trim().min(1).max(100),lastName:z.string().trim().min(1).max(100),
    company:z.string().trim().max(200),email:z.string().email().max(320),phone:z.string().max(60),
    subject:z.string().max(300),message:z.string().min(1).max(10000)
  }),
  dryRun:z.boolean().default(false)
});

export async function POST(request:Request){
  const requestId=crypto.randomUUID();
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Please check the URLs and sender details.",issues:parsed.error.flatten()},{status:400});
  const {urls:rawUrls,details,dryRun}=parsed.data;
  const urls=[...new Set(rawUrls.map(url=>url.trim()))];
  if(urls.length===0)return NextResponse.json({error:"At least one target URL is required.",requestId},{status:400});
  if(urls.length>MAX_UNIQUE_TARGETS)return NextResponse.json({error:`A maximum of ${MAX_UNIQUE_TARGETS} unique target URLs is allowed per batch.`,requestId},{status:400});
  const supabase=getSupabaseAdmin();
  let batchId:string|undefined;
  if(supabase&&!dryRun){
    const {data,error}=await supabase.from("submission_batches").insert({
      sender_name:`${details.firstName} ${details.lastName}`.trim(),company:details.company,email:details.email,phone:details.phone,
      subject:details.subject,message:details.message,total_targets:urls.length,status:"running"
    }).select("id").single();
    if(error){
      console.error("[submit] batch creation failed",{requestId,error:error.message});
      return NextResponse.json({error:"Unable to create the submission batch. Please try again.",requestId},{status:503});
    }
    batchId=data?.id;
  }
  const results=[];
  for(const url of urls){
    let result;
    try{
      result=await submitContactForm(url,details as SenderDetails,dryRun);
    }catch(error){
      result={
        url,
        status:"failed" as const,
        message:error instanceof Error?error.message:"Target processing failed unexpectedly.",
        evidence:["Automation error"] as const
      };
    }
    results.push(result);
    if(supabase&&batchId){
      const {error:targetInsertError}=await supabase.from("submission_targets").insert({
        batch_id:batchId,url,status:result.status,message:result.message,
        detected_fields:result.detectedFields??[],evidence:result.evidence??[],submitted_at:["success","submitted_unverified"].includes(result.status)?new Date().toISOString():null
      });
      if(targetInsertError)console.error("[submit] target persistence failed",{requestId,batchId,url,error:targetInsertError.message});
    }
  }
  const summary={
    total:results.length,
    success:results.filter(r=>r.status==="success").length,
    submitted_unverified:results.filter(r=>r.status==="submitted_unverified").length,
    captcha_required:results.filter(r=>r.status==="captcha_required").length,
    unsupported:results.filter(r=>r.status==="unsupported").length,
    failed:results.filter(r=>r.status==="failed").length,
    preview:results.filter(r=>r.status==="preview").length
  };
  if(supabase&&batchId){
    const hasIssues=summary.failed>0||summary.unsupported>0;
    const {error:batchUpdateError}=await supabase.from("submission_batches").update({
      status:hasIssues?"completed_with_issues":"completed"
    }).eq("id",batchId);
    if(batchUpdateError)console.error("[submit] batch finalization failed",{requestId,batchId,error:batchUpdateError.message});
  }
  console.info("[submit] batch completed",{requestId,batchId,total:summary.total,failed:summary.failed,captcha_required:summary.captcha_required});
  return NextResponse.json({batchId,dryRun,summary,results,requestId});
}
