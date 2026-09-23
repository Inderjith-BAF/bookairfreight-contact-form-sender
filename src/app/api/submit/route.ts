import { NextResponse } from "next/server";
import { z } from "zod";
import { submitContactForm } from "@/lib/form-engine";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SenderDetails } from "@/types/submission";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

const schema=z.object({
  urls:z.array(z.string().url()).min(1).max(25),
  details:z.object({
    firstName:z.string().trim().min(1).max(100),
    lastName:z.string().trim().min(1).max(100),
    company:z.string().trim().max(200),
    email:z.string().email().max(320),
    phone:z.string().max(60),
    subject:z.string().max(300),
    message:z.string().min(1).max(10000)
  }),
  dryRun:z.boolean().default(false)
});

export async function POST(request:Request){
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Please check the URLs and sender details.",issues:parsed.error.flatten()},{status:400});

  const {urls,details,dryRun}=parsed.data;
  const supabase=getSupabaseAdmin();
  let batchId:string|undefined;

  if(supabase&&!dryRun){
    const {data}=await supabase.from("submission_batches").insert({
      sender_name:`${details.firstName} ${details.lastName}`.trim(),
      company:details.company,
      email:details.email,
      phone:details.phone,
      subject:details.subject,
      message:details.message,
      total_targets:urls.length,
      status:"running"
    }).select("id").single();
    batchId=data?.id;
  }

  const results=[];
  for(const url of urls){
    const result=await submitContactForm(url,details as SenderDetails,dryRun,batchId);
    results.push(result);

    if(supabase&&batchId){
      await supabase.from("submission_targets").insert({
        batch_id:batchId,
        url,
        status:result.status,
        message:result.message,
        detected_fields:result.detectedFields??[],
        submitted_at:result.status==="success"?new Date().toISOString():null
      });
    }
  }

  if(supabase&&batchId){
    const hasPendingCaptcha=results.some(r=>r.status==="captcha_required"&&r.sessionId);
    const success=results.filter(r=>r.status==="success").length;
    await supabase.from("submission_batches").update({
      status:hasPendingCaptcha?"waiting_for_captcha":success===results.length?"completed":"completed_with_issues"
    }).eq("id",batchId);
  }

  return NextResponse.json({batchId,dryRun,results});
}
