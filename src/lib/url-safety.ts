import { lookup } from "node:dns/promises";
import net from "node:net";

function blockedIpv4(ip:string){
  const parts=ip.split(".").map(Number);
  if(parts.length!==4||parts.some(Number.isNaN))return true;
  const [a,b]=parts;
  return a===0||a===10||a===127||a===169&&b===254||a===192&&b===168||
    a===172&&b>=16&&b<=31||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||
    a>=224;
}

function blockedIp(ip:string){
  const normalized=ip.toLowerCase();
  if(net.isIPv4(normalized))return blockedIpv4(normalized);
  if(!net.isIPv6(normalized))return true;
  if(normalized==="::1"||normalized==="::"||normalized.startsWith("fe80:")||
    normalized.startsWith("fc")||normalized.startsWith("fd")||normalized.startsWith("ff"))return true;
  if(normalized.startsWith("::ffff:")){
    const mapped=normalized.slice(7);
    if(net.isIPv4(mapped))return blockedIpv4(mapped);
  }
  return false;
}

export async function assertSafeTargetUrl(raw:string){
  let parsed:URL;
  try{parsed=new URL(raw)}catch{throw new Error("Invalid target URL.")}

  if(!["http:","https:"].includes(parsed.protocol))throw new Error("Only HTTP and HTTPS target URLs are allowed.");
  if(parsed.username||parsed.password)throw new Error("Target URLs with embedded credentials are not allowed.");
  if(parsed.port&&parsed.port!=="80"&&parsed.port!=="443")throw new Error("Only standard HTTP/HTTPS ports are allowed.");

  const host=parsed.hostname.replace(/^\[|\]$/g,"").toLowerCase();
  if(host==="localhost"||host.endsWith(".localhost")||host==="metadata.google.internal")throw new Error("Private or local target URLs are not allowed.");

  if(net.isIP(host)){
    if(blockedIp(host))throw new Error("Private or reserved target IP addresses are not allowed.");
    return parsed.toString();
  }

  const records=await lookup(host,{all:true,verbatim:true});
  if(!records.length||records.some(record=>blockedIp(record.address))){
    throw new Error("Target hostname resolves to a private or reserved network address.");
  }
  return parsed.toString();
}
