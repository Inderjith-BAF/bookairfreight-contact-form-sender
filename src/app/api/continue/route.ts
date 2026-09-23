import { NextResponse } from "next/server";
import { z } from "zod";
import { continueContactForm } from "@/lib/form-engine";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

const schema=z.object({sessionId:z.string().uuid()});

export async function POST(request:Request){
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"A valid CAPTCHA session is required."},{status:400});

  const result=await continueContactForm(parsed.data.sessionId);
  const supabase=getSupabaseAdmin();

  if(supabase&&result.url){
    await supabase
      .from("submission_targets")
      .update({
        status:result.status,
        message:result.message,
        detected_fields:result.detectedFields??[],
        submitted_at:result.status==="success"?new Date().toISOString():null
      })
      .eq("url",result.url);
  }

  return NextResponse.json({result});
}
