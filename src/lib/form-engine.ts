import type { Page } from "puppeteer-core";
import { launchBrowser } from "@/lib/browser";
import { assertSafeTargetUrl } from "@/lib/url-safety";
import type { SenderDetails, SubmissionEvidence, SubmissionResult } from "@/types/submission";

type MappingKey=keyof SenderDetails|"fullName";
const aliases: Record<MappingKey,string[]> = {
  firstName:["first_name","firstname","first-name","given_name","givenname","given-name"],
  lastName:["last_name","lastname","last-name","surname","family_name","familyname","family-name"],
  fullName:["full_name","fullname","full-name","contact_name","contact-name","your-name","name"],
  company:["company","company_name","organization","organisation","business"],
  email:["email","email_address","e-mail","your-email","mail"],
  phone:["phone","telephone","tel","mobile","phone_number","contact_number"],
  subject:["subject","topic","enquiry_subject","inquiry_subject"],
  message:["message","comments","comment","enquiry","inquiry","description","your-message","details"]
};
const challengePattern=/captcha|recaptcha|hcaptcha|turnstile|challenge-platform|cf-chl-|i am not a robot|verify you are human/i;
const visibleChallengeText=/i am not a robot|verify (that )?you are human|complete (the )?(captcha|challenge)|security check|human verification|this site is protected by hcaptcha|protected by hcaptcha|hcaptcha protection/i;
function norm(v:string){return v.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function scoreField(field:{tag:string;type:string;name:string;id:string;placeholder:string;autocomplete:string;label:string},key:MappingKey){
  const hay=norm([field.name,field.id,field.placeholder,field.autocomplete,field.label].join(" "));
  let score=0;
  for(const alias of aliases[key]){const a=norm(alias);if(hay===a)score+=100;else if(hay.includes(a))score+=30;}
  if(key==="email"&&field.type==="email")score+=35;
  if(key==="phone"&&["tel","phone"].includes(field.type))score+=35;
  if(key==="message"&&field.tag==="textarea")score+=30;
  return score;
}
function isContactMapping(mapping:Array<{key:MappingKey;controlIndex:number;score:number}>){
  const keys=new Set(mapping.map(x=>x.key));
  const hasName=keys.has("firstName")||keys.has("lastName")||keys.has("fullName");
  return (keys.has("email")&&keys.has("message"))||(hasName&&keys.has("email"))||(hasName&&keys.has("message")&&mapping.length>=3);
}
async function inspect(page:Page){
  return page.evaluate(()=>{
    const forms=Array.from(document.forms);
    forms.forEach((form,i)=>form.setAttribute("data-baf-form",String(i)));
    return forms.map((form,formIndex)=>{
      const controls=Array.from(form.querySelectorAll("input,textarea,select")).filter((el:any)=>{
        const type=(el.type||"").toLowerCase();
        return !el.disabled&&!["hidden","submit","button","reset","file","image","checkbox","radio"].includes(type);
      }).map((el:any,index)=>{
        el.setAttribute("data-baf-control",String(index));
        return {tag:el.tagName.toLowerCase(),type:(el.type||"").toLowerCase(),name:el.name||"",id:el.id||"",placeholder:el.placeholder||"",autocomplete:el.autocomplete||"",label:el.labels?.[0]?.textContent?.trim()||"",required:Boolean(el.required)};
      });
      const action=form.getAttribute("action")||"";
      const method=(form.getAttribute("method")||"get").toUpperCase();
      const formType=(form.querySelector('input[name="form_type"]') as HTMLInputElement|null)?.value||"";
      const shopifyContact=/\/contact(?:#|$)/i.test(action)||formType==="contact";
      return {formIndex,controls,action,method,formType,shopifyContact};
    });
  });
}
async function detectProtection(page:Page,formIndex:number|null):Promise<SubmissionEvidence[]>{
  return page.evaluate((index)=>{
    const evidence:string[]=[]; const add=(v:string)=>{if(!evidence.includes(v))evidence.push(v);};
    const visible=(el:Element)=>{const n=el as HTMLElement,s=getComputedStyle(n),r=n.getBoundingClientRect();return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity||1)>0&&r.width>0&&r.height>0;};
    const form=index===null?null:document.querySelector("form[data-baf-form=\""+index+"\"]") as HTMLFormElement|null;
    const forms=form?[form]:Array.from(document.forms);
    for(const target of forms){
      const action=target.getAttribute("action")||"";
      const type=(target.querySelector('input[name="form_type"]') as HTMLInputElement|null)?.value||"";
      const shopify=/\/contact(?:#|$)/i.test(action)||type==="contact";
      if(!shopify)continue;
      if(target.getAttribute("data-shopify-captcha")==="true")add("Shopify hCaptcha wired to contact form");
      if(target.querySelector(".h-captcha,iframe[src*='hcaptcha' i],iframe[src*='recaptcha' i],textarea[name='h-captcha-response'],textarea[name='g-recaptcha-response']"))add("CAPTCHA widget or response field attached to contact form");
      if(target.querySelector(".cf-turnstile,iframe[src*='challenges.cloudflare.com' i],input[name='cf-turnstile-response']"))add("Cloudflare Turnstile attached to contact form");
      if(typeof (window as any).Shopify?.captcha?.protect==="function")add("Shopify CAPTCHA service active for contact form");
    }
    for(const el of Array.from(document.querySelectorAll(".h-captcha,.g-recaptcha,.cf-turnstile,iframe[src*='hcaptcha' i],iframe[src*='recaptcha' i],iframe[src*='challenges.cloudflare.com' i]"))){
      if(!visible(el))continue;
      const hay=[el.getAttribute("src")||"",el.getAttribute("title")||"",el.getAttribute("aria-label")||"",String((el as HTMLElement).className||"")].join(" ");
      if(/hcaptcha|recaptcha/i.test(hay))add("Visible CAPTCHA widget detected");
      if(/turnstile|challenges\.cloudflare\.com/i.test(hay))add("Visible Cloudflare Turnstile detected");
    }
    if(/\/challenge(?:[/?#]|$)|cf-chl-|challenge-platform|cdn-cgi\/challenge/i.test(location.href))add("Browser challenge page detected");
    if(/i am not a robot|verify (that )?you are human|complete (the )?(captcha|challenge)|human verification|this site is protected by hcaptcha|protected by hcaptcha|hcaptcha protection|checking your browser/i.test(document.body?.innerText||""))add("Visible challenge text detected");
    return evidence;
  },formIndex);
}
async function fillField(page:Page,formIndex:number,controlIndex:number,value:string){
  const handle=await page.$(`form[data-baf-form="${formIndex}"] [data-baf-control="${controlIndex}"]`);
  if(!handle)return false;
  await handle.evaluate((el:any,nextValue:string)=>{
    const proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
    setter?.call(el,nextValue);
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
    el.dispatchEvent(new Event("blur",{bubbles:true}));
  },value);
  await handle.dispose(); return true;
}
async function validateForm(page:Page,formIndex:number){
  return page.evaluate((index)=>{
    const form=document.querySelector(`form[data-baf-form="${index}"]`) as HTMLFormElement|null;
    if(!form)return {valid:false,missing:["Target form disappeared."]};
    const invalid=Array.from(form.elements).filter((el:any)=>typeof el.checkValidity==="function"&&!el.checkValidity()).map((el:any)=>{
      const label=el.labels?.[0]?.textContent?.trim();
      return label||el.name||el.id||el.type||"required field";
    });
    return {valid:form.checkValidity(),missing:[...new Set(invalid)]};
  },formIndex);
}
async function submitForm(page:Page,formIndex:number){
  const form=await page.$('form[data-baf-form="'+formIndex+'"]');
  if(!form)throw new Error("Target form disappeared.");
  const submission=await form.evaluate((el:any)=>{
    const submitter=el.querySelector('button[type="submit"],input[type="submit"],button:not([type]),button') as HTMLButtonElement|HTMLInputElement|null;
    const action=new URL(submitter?.formAction||el.action||location.href,location.href).toString();
    const method=(submitter?.formMethod||el.method||"get").toUpperCase();
    return {action,method};
  });
  const expectedAction=new URL(submission.action);
  const requests:Array<{method:string;url:string}>=[];
  const responses:Array<{method:string;url:string;status:number}>=[];
  const onRequest=(request:any)=>{
    if(request.isNavigationRequest()&&request.frame()!==page.mainFrame())return;
    const method=request.method();
    if(["GET","POST","PUT","PATCH","DELETE"].includes(method))requests.push({method,url:request.url()});
  };
  const onResponse=(response:any)=>{
    const request=response.request();
    const method=request.method();
    if(["GET","POST","PUT","PATCH","DELETE"].includes(method))responses.push({method,url:response.url(),status:response.status()});
  };
  page.on("request",onRequest);
  page.on("response",onResponse);
  try{
    if(submission.method==="DIALOG")return {observed:false,request:null,requests,responses,diagnostic:"The form uses a dialog submission method."};
    const navigation=page.waitForNavigation({waitUntil:"domcontentloaded",timeout:12000}).catch(()=>null);
    const submitter=await form.$('button[type="submit"],input[type="submit"],button:not([type]),button');
    if(submitter){try{await submitter.click({delay:30});}catch{await form.evaluate((el:any)=>el.requestSubmit());}}
    else await form.evaluate((el:any)=>el.requestSubmit());
    await Promise.race([navigation,new Promise(resolve=>setTimeout(resolve,5000))]);
    const sameOriginRequest=requests.find(item=>{try{const actual=new URL(item.url);return actual.origin===expectedAction.origin&&item.method===submission.method;}catch{return false;}});
    const responseForRequest=sameOriginRequest?responses.find(item=>item.url===sameOriginRequest.url&&item.method===sameOriginRequest.method):undefined;
    const postLike=requests.find(item=>item.method==="POST");
    const responseStatus=responseForRequest?.status;
    const diagnostic=sameOriginRequest
      ? "Submission request observed: "+sameOriginRequest.method+" "+sameOriginRequest.url+(responseStatus?" (HTTP "+responseStatus+")":"")+"."
      : postLike
        ? "A POST request occurred, but not to the form action: "+postLike.url+"."
        : "No POST or matching "+submission.method+" request was observed. "+requests.length+" HTTP request(s) occurred during submission.";
    return {observed:Boolean(sameOriginRequest),request:sameOriginRequest||null,requests,responses,diagnostic};
  }finally{
    page.off("request",onRequest);
    page.off("response",onResponse);
  }
}
async function successSignal(page:Page,beforeUrl:string,formIndex:number){
  const currentUrl=page.url();
  const state=await page.evaluate((index)=>{
    const form=document.querySelector('form[data-baf-form="'+index+'"]') as HTMLFormElement|null;
    const text=document.body?.innerText?.slice(0,50000)||"";
    const visibleText=/thank you|thanks for|message sent|successfully sent|submission received|we'll be in touch|we will be in touch/i.test(text);
    const challengeText=/captcha|hcaptcha|recaptcha|verify you are human|security check/i.test(text);
    const formState=form?{exists:true,visible:!!(form as HTMLElement).offsetParent,submitDisabled:Boolean(form.querySelector('button[type="submit"]:disabled,input[type="submit"]:disabled')),values:Array.from(form.elements).filter((el:any)=>"value" in el).map((el:any)=>String(el.value||"")).join("|")}:{exists:false,visible:false,submitDisabled:false,values:""};
    return {visibleText,challengeText,formState};
  },formIndex);
  return {confirmed:currentUrl!==beforeUrl||state.visibleText,challengeText:state.challengeText,formState:state.formState,currentUrl};
}
export async function submitContactForm(url:string,details:SenderDetails,dryRun=false):Promise<SubmissionResult>{
  let safeUrl:string;
  try{safeUrl=await assertSafeTargetUrl(url);}catch(error){return{url,status:"failed",message:error instanceof Error?error.message:"Target URL was rejected."};}
  const browser=await launchBrowser();
  try{
    const page=await browser.newPage();
    await page.setUserAgent("BookAirfreightContactFormSender/1.0");
    await page.setDefaultNavigationTimeout(20000);
    await page.setRequestInterception(true);
    page.on("request",async request=>{
      if(request.isInterceptResolutionHandled())return;
      if(!request.isNavigationRequest()||request.frame()!==page.mainFrame()){
        request.continue().catch(()=>undefined);
        return;
      }
      try{await assertSafeTargetUrl(request.url());request.continue().catch(()=>undefined);}
      catch{request.abort("blockedbyclient").catch(()=>undefined);}
    });
    await page.goto(safeUrl,{waitUntil:"domcontentloaded",timeout:20000});
    const forms=await inspect(page);
    if(!forms.length)return{url,status:"unsupported",message:"No HTML contact form was detected on this page."};
    const challenge=await detectChallenge(page);
    const shopifyCaptcha=await detectShopifyCaptcha(page);
    if(challenge||shopifyCaptcha)return{url,status:"captcha_required",message:shopifyCaptcha?"Shopify hCaptcha protection detected on the contact form. Submission skipped and added to the CAPTCHA queue.":"CAPTCHA or anti-bot challenge detected. Submission skipped and added to the CAPTCHA queue."};
    let best:{formIndex:number;mapping:Array<{key:MappingKey;controlIndex:number;score:number}>}|null=null;
    for(const form of forms){
      const used=new Set<number>();
      const mapping:Array<{key:MappingKey;controlIndex:number;score:number}>=[];
      const keys=(Object.keys(aliases) as MappingKey[]).sort((a,b)=>a==="fullName"?1:b==="fullName"?-1:0);
      for(const key of keys){
        let bestMatch={controlIndex:-1,score:0};
        form.controls.forEach((control,index)=>{if(used.has(index))return;const score=scoreField(control,key);if(score>bestMatch.score)bestMatch={controlIndex:index,score};});
        if(bestMatch.controlIndex>=0&&bestMatch.score>=30){mapping.push({key,...bestMatch});used.add(bestMatch.controlIndex);}
      }
      if(!isContactMapping(mapping))continue;
      const score=mapping.reduce((s,x)=>s+x.score,0);
      if(!best||score>best.mapping.reduce((s,x)=>s+x.score,0))best={formIndex:form.formIndex,mapping};
    }
    if(!best)return{url,status:"unsupported",message:"No mappable HTML contact form was detected on this page."};
    const detectedFields=best.mapping.map(x=>x.key);
    for(const item of best.mapping){
      let value="";
      if(item.key==="fullName")value=(details.firstName+" "+details.lastName).trim();
      else value=details[item.key];
      if(value)await fillField(page,best.formIndex,item.controlIndex,value);
    }
    if(dryRun)return{url,status:"preview",message:"Form loaded and fields were mapped without submitting.",detectedFields};
    const afterFillProtection=await detectProtection(page,best.formIndex);\n    if(afterFillProtection.length)return{url,status:"captcha_required",message:"Explicit anti-bot protection detected before submission: "+afterFillProtection.join(" • "),detectedFields,evidence:afterFillProtection};
    const validity=await validateForm(page,best.formIndex);
    if(!validity.valid)return{url,status:"failed",message:"Form validation blocked submission. Missing or invalid field: "+validity.missing.join(", ")+".",detectedFields};
    const beforeUrl=page.url();
    const submission=await submitForm(page,best.formIndex);
    const success=await successSignal(page,beforeUrl,best.formIndex);
    if(success.challengeText)return{url,status:"captcha_required",message:"An anti-bot or spam-protection signal appeared during submission. Submission could not be safely verified and was added to the CAPTCHA queue.",detectedFields};
    if(submission.observed){
      return{url,status:success.confirmed?"success":"submitted_unverified",message:success.confirmed?"Submission request was observed and the page returned a success signal. "+submission.diagnostic:"Submission request was observed, but the page did not return a success confirmation. "+submission.diagnostic,detectedFields};
    }
    if(success.confirmed)return{url,status:"submitted_unverified",message:"The form changed state after submission, but the expected submission request could not be directly observed. "+submission.diagnostic+" Treat as sent and review if needed.",detectedFields};
    return{url,status:"failed",message:"No submission request or success signal was observed after clicking the form submit control. "+submission.diagnostic,detectedFields};
  }catch(error){
    const raw=error instanceof Error?error.message:"Browser automation failed.";
    const browserTargetError=/target closed|targetclose|execution context was destroyed|session closed|protocol error/i.test(raw);
    return{url,status:"failed",message:browserTargetError?"The target page closed unexpectedly while processing this form. The site or browser session ended before submission could be verified.":raw,detectedFields:[]};
  }
  finally{await browser.close().catch(()=>undefined);}
}
