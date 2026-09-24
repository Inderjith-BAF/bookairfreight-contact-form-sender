import type { Page } from "puppeteer-core";
import { launchBrowser } from "@/lib/browser";
import { assertSafeTargetUrl } from "@/lib/url-safety";
import type { SenderDetails, SubmissionResult } from "@/types/submission";
import { chooseBestContactForm } from "@/lib/form-mapper";

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
    const sameOriginRequest=requests.find(item=>{try{const actual=new URL(item.url);const expectedPath=expectedAction.pathname;return actual.origin===expectedAction.origin&&actual.pathname===expectedPath&&item.method===submission.method;}catch{return false;}});
    const responseForRequest=sameOriginRequest?responses.find(item=>item.url===sameOriginRequest.url&&item.method===sameOriginRequest.method):undefined;
    const postLike=requests.find(item=>item.method==="POST");
    const responseStatus=responseForRequest?.status;
    const responseAccepted=typeof responseStatus==="number"&&responseStatus>=200&&responseStatus<400;
    const diagnostic=sameOriginRequest
      ? "Submission request observed: "+sameOriginRequest.method+" "+sameOriginRequest.url+(typeof responseStatus==="number"?" (HTTP "+responseStatus+")":"")+"."
      : postLike
        ? "A POST request occurred, but not to the expected form endpoint: "+postLike.url+"."
        : "No matching "+submission.method+" request was observed. "+requests.length+" HTTP request(s) occurred during submission.";
    return {observed:Boolean(sameOriginRequest),accepted:responseAccepted,request:sameOriginRequest||null,requests,responses,diagnostic};
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
    const visibleText=/thank you|thanks for|message sent|successfully sent|submission received|we'll be in touch|we will be in touch|your message has been sent|form submitted/i.test(text);
    const challengeText=/i am not a robot|verify (that )?you are human|complete (the )?(captcha|challenge)|human verification|this site is protected by hcaptcha|protected by hcaptcha|hcaptcha protection|checking your browser/i.test(text);
    const errorText=/something went wrong|an error occurred|error submitting|unable to submit|could not submit|submission failed|please try again|invalid email|invalid phone|required field|field is required|there was a problem/i.test(text);
    const formState=form?{exists:true,visible:!!(form as HTMLElement).offsetParent,submitDisabled:Boolean(form.querySelector('button[type="submit"]:disabled,input[type="submit"]:disabled')),values:Array.from(form.elements).filter((el:any)=>"value" in el).map((el:any)=>String(el.value||"")).join("|")}:{exists:false,visible:false,submitDisabled:false,values:""};
    return {visibleText,challengeText,errorText,formState};
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
    await page.setDefaultNavigationTimeout(15000);\n    page.setDefaultTimeout(10000);
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
    await page.goto(safeUrl,{waitUntil:"domcontentloaded",timeout:15000});
    const forms=await inspect(page);
    if(!forms.length)return{url,status:"unsupported",message:"No HTML contact form was detected on this page."};
    const challenge=await detectChallenge(page);
    const shopifyCaptcha=await detectShopifyCaptcha(page);
    if(challenge||shopifyCaptcha)return{url,status:"captcha_required",message:shopifyCaptcha?"Shopify hCaptcha protection detected on the contact form. Submission skipped and added to the CAPTCHA queue.":"CAPTCHA or anti-bot challenge detected. Submission skipped and added to the CAPTCHA queue."};
    const best=chooseBestContactForm(forms);
    if(!best)return{url,status:"unsupported",message:"No mappable HTML contact form was detected on this page."};
    const detectedFields=best.mapping.detectedFields;
    for(const item of best.mapping.matches){
      let value="";
      if(item.key==="fullName")value=(details.firstName+" "+details.lastName).trim();
      else value=details[item.key];
      if(value)await fillField(page,best.form.formIndex,item.controlIndex,value);
    }
    if(dryRun)return{url,status:"preview",message:"Form loaded and fields were mapped without submitting.",detectedFields};
    const afterFillProtection=await detectProtection(page,best.formIndex);\n    if(afterFillProtection.length)return{url,status:"captcha_required",message:"Explicit anti-bot protection detected before submission: "+afterFillProtection.join(" • "),detectedFields,evidence:afterFillProtection};
    const validity=await validateForm(page,best.form.formIndex);
    if(!validity.valid)return{url,status:"failed",message:"Form validation blocked submission. Missing or invalid field: "+validity.missing.join(", ")+".",detectedFields};
    const beforeUrl=page.url();
    const submission=await submitForm(page,best.form.formIndex);
    const success=await successSignal(page,beforeUrl,best.form.formIndex);
    if(success.challengeText)return{url,status:"captcha_required",message:"A visible human-verification challenge appeared after submission. Submission was not treated as successful and was added to the CAPTCHA queue.",detectedFields,evidence:["Target page reported an error"]};
    if(success.errorText)return{url,status:"failed",message:"The target page reported a submission or validation error after the form was submitted. "+submission.diagnostic,detectedFields,evidence:["Target page reported an error"]};
    if(submission.observed&&submission.accepted&&success.confirmed){
      return{url,status:"success",message:"Submission request was observed, received an HTTP "+(submission.responses.find(r=>r.url===submission.request?.url)?.status??"2xx/3xx")+" response, and the page returned a success signal.",detectedFields,evidence:["Submission request observed","Success confirmation detected"]};
    }
    if(submission.observed&&submission.accepted){
      return{url,status:"submitted_unverified",message:"Submission request was observed and the target returned an HTTP "+(submission.responses.find(r=>r.url===submission.request?.url)?.status??"success")+" response, but no explicit success confirmation was detected.",detectedFields,evidence:["Submission request observed","No success confirmation"]};
    }
    if(submission.observed&&!submission.accepted){
      return{url,status:"failed",message:"Submission request was observed, but the target returned an HTTP "+(submission.responses.find(r=>r.url===submission.request?.url)?.status??"error")+" response. "+submission.diagnostic,detectedFields,evidence:["Submission request observed","Target page reported an error"]};
    }
    if(success.confirmed)return{url,status:"submitted_unverified",message:"The form changed state, but the expected submission request could not be directly observed. "+submission.diagnostic,detectedFields,evidence:["No matching submission request","No success confirmation"]};
    return{url,status:"failed",message:"No matching submission request or success signal was observed after submission. "+submission.diagnostic,detectedFields,evidence:["No matching submission request","No success confirmation"]};
  }catch(error){
    const raw=error instanceof Error?error.message:"Browser automation failed.";
    const browserTargetError=/target closed|targetclose|execution context was destroyed|session closed|protocol error/i.test(raw);
    return{url,status:"failed",message:browserTargetError?"The target page closed unexpectedly while processing this form. The site or browser session ended before submission could be verified.":raw,detectedFields:[]};
  }
  finally{await browser.close().catch(()=>undefined);}
}
