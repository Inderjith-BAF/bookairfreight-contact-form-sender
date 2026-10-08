import {NextResponse} from "next/server";
import {requireOutboundUser} from "@/lib/outbound-auth";
import {oauthRedirect,providerConfigured,signOAuthState,type Provider} from "@/lib/mail-merge-oauth";
export const runtime="nodejs";
export async function GET(request:Request){
 const auth=await requireOutboundUser(request);if("error" in auth)return auth.error;
 const provider=new URL(request.url).searchParams.get("provider") as Provider;
 if(provider!=="google"&&provider!=="microsoft")return NextResponse.json({error:"Unsupported email provider."},{status:400});
 if(!providerConfigured(provider))return NextResponse.json({error:`${provider==="google"?"Google Workspace":"Microsoft 365"} connection is not configured in this environment yet.`},{status:503});
 const state=signOAuthState({provider,profileId:auth.profile.id,nonce:crypto.randomUUID()});
 const redirect=oauthRedirect(request,provider);
 if(provider==="google"){
  const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id",process.env.GOOGLE_CLIENT_ID!);url.searchParams.set("redirect_uri",redirect);url.searchParams.set("response_type","code");url.searchParams.set("access_type","offline");url.searchParams.set("prompt","consent");url.searchParams.set("scope","openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly");url.searchParams.set("state",state);
  return NextResponse.redirect(url);
 }
 const url=new URL("https://login.microsoftonline.com/"+encodeURIComponent(process.env.MICROSOFT_TENANT_ID||"common")+"/oauth2/v2.0/authorize");
 url.searchParams.set("client_id",process.env.MICROSOFT_CLIENT_ID!);url.searchParams.set("redirect_uri",redirect);url.searchParams.set("response_type","code");url.searchParams.set("response_mode","query");url.searchParams.set("scope","openid profile email offline_access Mail.Send Mail.Read");url.searchParams.set("state",state);
 return NextResponse.redirect(url);
}
