import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
export const runtime="nodejs";
export async function POST(request:Request){
  const auth=await requireOutboundUser(request,["admin"]);
  if("error" in auth)return auth.error;
  const body=await request.json().catch(()=>null);
  const email=String(body?.email??"").trim().toLowerCase(), password=String(body?.password??""), fullName=String(body?.full_name??"").trim();
  const role=["admin","manager","member"].includes(body?.role)?body.role:"member";
  if(!email||password.length<8||!fullName)return NextResponse.json({error:"Name, email and an 8+ character password are required."},{status:400});
  const {data,error}=await auth.admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName}});
  if(error||!data.user)return NextResponse.json({error:error?.message??"Unable to create user."},{status:400});
  const {error:profileError}=await auth.admin.from("outbound_profiles").insert({id:data.user.id,full_name:fullName,role,active:true});
  if(profileError){await auth.admin.auth.admin.deleteUser(data.user.id);return NextResponse.json({error:profileError.message},{status:500});}
  const accounts=String(body?.accounts??"").split(/[\n,]/).map(v=>v.trim().toLowerCase()).filter(Boolean);
  if(accounts.length)await auth.admin.from("outbound_email_accounts").upsert(accounts.map((email:string)=>({email,employee_id:data.user!.id})),{onConflict:"email"});
  return NextResponse.json({userId:data.user.id});
}
