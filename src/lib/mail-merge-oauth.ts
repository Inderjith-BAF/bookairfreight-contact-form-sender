import crypto from "node:crypto";

export type Provider="google"|"microsoft";
const key=()=>Buffer.from(process.env.MAIL_MERGE_TOKEN_ENCRYPTION_KEY||"","hex");
function requireKey(){const k=key();if(k.length!==32)throw new Error("MAIL_MERGE_TOKEN_ENCRYPTION_KEY must be a 64-character hex key.");return k;}
export function encryptSecret(value:string){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",requireKey(),iv);const out=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return [iv,cipher.getAuthTag(),out].map(x=>x.toString("base64url")).join(".");}
export function decryptSecret(value:string){const [iv,tag,data]=value.split(".").map(x=>Buffer.from(x,"base64url"));const decipher=crypto.createDecipheriv("aes-256-gcm",requireKey(),iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(data),decipher.final()]).toString("utf8");}
const stateSecret=()=>process.env.MAIL_MERGE_OAUTH_STATE_SECRET||process.env.MAIL_MERGE_TOKEN_ENCRYPTION_KEY||"";
export function signOAuthState(payload:{provider:Provider;profileId:string;nonce:string}){const raw=Buffer.from(JSON.stringify(payload)).toString("base64url");const sig=crypto.createHmac("sha256",stateSecret()).update(raw).digest("base64url");return raw+"."+sig;}
export function verifyOAuthState(state:string){const [raw,sig]=state.split(".");if(!raw||!sig)return null;const expected=crypto.createHmac("sha256",stateSecret()).update(raw).digest("base64url");if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;try{return JSON.parse(Buffer.from(raw,"base64url").toString()) as {provider:Provider;profileId:string;nonce:string};}catch{return null;}}
export function oauthRedirect(request:Request,provider:Provider){const env=provider==="google"?process.env.MAIL_MERGE_GOOGLE_REDIRECT_URI:process.env.MAIL_MERGE_MICROSOFT_REDIRECT_URI;return env||new URL("/api/mail-merge/oauth/callback",request.url).toString();}
export function providerConfigured(provider:Provider){return provider==="google"?!!(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET):(!!(process.env.MICROSOFT_CLIENT_ID&&process.env.MICROSOFT_CLIENT_SECRET));}
export function providerLabel(p:string){return p==="google"?"Google Workspace":p==="microsoft"?"Microsoft 365":p;}
