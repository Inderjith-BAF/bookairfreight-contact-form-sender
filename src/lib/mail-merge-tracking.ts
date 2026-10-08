import crypto from "node:crypto";
const secret=()=>process.env.MAIL_MERGE_TRACKING_SECRET||process.env.MAIL_MERGE_TOKEN_ENCRYPTION_KEY||"";
export function signTrackingToken(id:string){const raw=Buffer.from(id).toString("base64url");const sig=crypto.createHmac("sha256",secret()).update(raw).digest("base64url");return raw+"."+sig;}
export function verifyTrackingToken(token:string){const [raw,sig]=token.split(".");if(!raw||!sig)return null;const expected=crypto.createHmac("sha256",secret()).update(raw).digest("base64url");if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;try{return Buffer.from(raw,"base64url").toString("utf8")}catch{return null;}}
