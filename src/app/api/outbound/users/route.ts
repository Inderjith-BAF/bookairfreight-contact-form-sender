import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
export const runtime="nodejs";
export async function POST(request:Request){
  const auth=await requireOutboundUser(request,["admin"]);
  if("error" in auth)return auth.error;
  const body=await request.json().catch(()=>null);
  const email=String(body?.email??"").trim().toLowerCase(), password=String(body?.password??""), fullName=String(body?.full_name??"").trim();
  const role=["admin","manager","member"].includes(body?.role)?body.role:"member";
  const defaultTabs={intelligence:true,command:true,daily:true,weekly:true,monthly:true,my:true,forms:true};
  const tabPermissions={...defaultTabs,...(body?.tab_permissions&&typeof body?.tab_permissions==="object"?body.tab_permissions:{})};
  if(!email||password.length<8||!fullName)return NextResponse.json({error:"Name, email and an 8+ character password are required."},{status:400});
  const {data,error}=await auth.admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName}});
  if(error||!data.user)return NextResponse.json({error:error?.message??"Unable to create user."},{status:400});
  const {error:profileError}=await auth.admin.from("outbound_profiles").insert({id:data.user.id,full_name:fullName,role,active:true,tab_permissions:tabPermissions});
  if(profileError){await auth.admin.auth.admin.deleteUser(data.user.id);return NextResponse.json({error:profileError.message},{status:500});}
  const accounts=String(body?.accounts??"").split(/[\n,]/).map(v=>v.trim().toLowerCase()).filter(Boolean);
  if(accounts.length)await auth.admin.from("outbound_email_accounts").upsert(accounts.map((email:string)=>({email,employee_id:data.user!.id})),{onConflict:"email"});
  return NextResponse.json({userId:data.user.id});
}

export async function PATCH(request:Request){
  const auth=await requireOutboundUser(request,["admin"]);
  if("error" in auth)return auth.error;
  const body=await request.json().catch(()=>null);
  const userId=String(body?.user_id??"").trim();
  const email=String(body?.email??"").trim().toLowerCase();
  const fullName=String(body?.full_name??"").trim();
  const role=["admin","manager","member"].includes(body?.role)?body.role:"member";
  const active=body?.active!==false;
  const defaultTabs={intelligence:true,command:true,daily:true,weekly:true,monthly:true,my:true,forms:true};
  const tabPermissions={...defaultTabs,...(body?.tab_permissions&&typeof body?.tab_permissions==="object"?body.tab_permissions:{})};
  if(!userId||!fullName)return NextResponse.json({error:"User ID and name are required."},{status:400});
  const {error:userError}=await auth.admin.auth.admin.updateUserById(userId,email?{email,email_confirm:true,user_metadata:{full_name:fullName}}:{user_metadata:{full_name:fullName}});
  if(userError)return NextResponse.json({error:userError.message},{status:400});
  const {error:profileError}=await auth.admin.from("outbound_profiles").update({full_name:fullName,role,active,tab_permissions:tabPermissions}).eq("id",userId);
  if(profileError)return NextResponse.json({error:profileError.message},{status:500});
  const accounts=String(body?.accounts??"").split(/[\n,]/).map(v=>v.trim().toLowerCase()).filter(Boolean);
  const {error:deleteAccountsError}=await auth.admin.from("outbound_email_accounts").delete().eq("employee_id",userId);
  if(deleteAccountsError)return NextResponse.json({error:deleteAccountsError.message},{status:500});
  if(accounts.length){const {error:accountError}=await auth.admin.from("outbound_email_accounts").upsert(accounts.map((account:string)=>({email:account,employee_id:userId})),{onConflict:"email"});if(accountError)return NextResponse.json({error:accountError.message},{status:500});}
  return NextResponse.json({updated:true});
}
