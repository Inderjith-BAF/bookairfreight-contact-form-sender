import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabase";
import {encryptSecret,oauthRedirect,verifyOAuthState,type Provider} from "@/lib/mail-merge-oauth";
export const runtime="nodejs";
export async function GET(request:Request){
 const url=new URL(request.url),code=url.searchParams.get("code"),state=url.searchParams.get("state"),error=url.searchParams.get("error");
 if(error||!code||!state)return NextResponse.redirect(new URL("/mail-merge?connection=error&reason="+encodeURIComponent(error||"Authorization was cancelled."),request.url));
 const parsed=verifyOAuthState(state);if(!parsed)return NextResponse.redirect(new URL("/mail-merge?connection=error&reason=Invalid%20authorization%20state",request.url));
 const provider=parsed.provider as Provider,redirect=oauthRedirect(request,provider);
 let token:any;
 if(provider==="google"){
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID||"",client_secret:process.env.GOOGLE_CLIENT_SECRET||"",code,redirect_uri:redirect,grant_type:"authorization_code"})});
  token=await r.json();if(!r.ok||!token.access_token)return NextResponse.redirect(new URL("/mail-merge?connection=error&reason="+encodeURIComponent(token.error_description||"Google token exchange failed."),request.url));
 }else{
  const tenant=process.env.MICROSOFT_TENANT_ID||"common";
  const r=await fetch("https://login.microsoftonline.com/"+encodeURIComponent(tenant)+"/oauth2/v2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.MICROSOFT_CLIENT_ID||"",client_secret:process.env.MICROSOFT_CLIENT_SECRET||"",code,redirect_uri:redirect,grant_type:"authorization_code",scope:"openid profile email offline_access Mail.Send Mail.Read"})});
  token=await r.json();if(!r.ok||!token.access_token)return NextResponse.redirect(new URL("/mail-merge?connection=error&reason="+encodeURIComponent(token.error_description||"Microsoft token exchange failed."),request.url));
 }
 const admin=getSupabaseAdmin();if(!admin)return NextResponse.redirect(new URL("/mail-merge?connection=error&reason=Supabase%20is%20not%20configured",request.url));
 let email="",providerId="";
 if(provider==="google"){
  const r=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile",{headers:{Authorization:"Bearer "+token.access_token}});const d=await r.json();email=String(d.emailAddress||"").toLowerCase();providerId=String(d.emailAddress||"");
 }else{
  const r=await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName",{headers:{Authorization:"Bearer "+token.access_token}});const d=await r.json();email=String(d.mail||d.userPrincipalName||"").toLowerCase();providerId=String(d.id||"");
 }
 if(!email)return NextResponse.redirect(new URL("/mail-merge?connection=error&reason=Could%20not%20verify%20the%20mailbox%20identity",request.url));
 let {data:existingAccount}=await admin.from("outbound_email_accounts").select("id,refresh_token_encrypted,total_sent,daily_send_limit,hourly_send_limit").eq("provider",provider).eq("provider_account_id",providerId).maybeSingle();
 if(!existingAccount){const {data:legacy}=await admin.from("outbound_email_accounts").select("id,refresh_token_encrypted,total_sent,daily_send_limit,hourly_send_limit").eq("employee_id",parsed.profileId).eq("email",email).maybeSingle();existingAccount=legacy;} const row:any={email,employee_id:parsed.profileId,active:true,daily_send_limit:Number(existingAccount?.daily_send_limit||100),hourly_send_limit:Number(existingAccount?.hourly_send_limit||20),health_status:"Healthy",total_sent:Number(existingAccount?.total_sent||0),provider,provider_account_id:providerId,connection_status:"Connected",connection_error:null,refresh_token_encrypted:token.refresh_token?encryptSecret(token.refresh_token):(existingAccount?.refresh_token_encrypted||null),access_token_encrypted:encryptSecret(token.access_token),access_token_expires_at:new Date(Date.now()+Number(token.expires_in||3600)*1000).toISOString(),last_verified_at:new Date().toISOString()};
 const existing=existingAccount;
 const result=existing?await admin.from("outbound_email_accounts").update(row).eq("id",existing.id).select("*").single():await admin.from("outbound_email_accounts").insert(row).select("*").single();
 if(result.error)return NextResponse.redirect(new URL("/mail-merge?connection=error&reason="+encodeURIComponent(result.error.message),request.url));
 await admin.from("mail_merge_notifications").update({read_at:new Date().toISOString()}).eq("recipient_profile_id",parsed.profileId).eq("account_id",result.data.id).eq("notification_type","account_disconnected");
 return NextResponse.redirect(new URL("/mail-merge?connection=success&email="+encodeURIComponent(email),request.url));
}
