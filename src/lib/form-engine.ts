import type { Page } from "puppeteer-core";
import { launchBrowser } from "@/lib/browser";
import type { SenderDetails, SubmissionResult } from "@/types/submission";

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
const visibleChallengeText=/i am not a robot|verify (that )?you are human|complete (the )?(captcha|challenge)|security check|human verification/i;
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
        return {tag:el.tagName.toLowerCase(),type:(el.type||"").toLowerCase(),name:el.name||"",id:el.id||"",placeholder:el.placeholder||"",autocomplete:el.autocomplete||"",label:el.labels?.[0]?.textContent?.trim()||""};
      });
      return {formIndex,controls};
    });
  });
}
async function detectChallenge(page:Page){
  return page.evaluate((patterns)=>{
    const re=new RegExp(patterns.element,"i");
    const textRe=new RegExp(patterns.text,"i");
    const visible=(el:Element)=>{
      const node=el as HTMLElement;
      const style=getComputedStyle(node);
      const rect=node.getBoundingClientRect();
      return style.display!=="none"&&style.visibility!=="hidden"&&Number(style.opacity||1)>0&&rect.width>0&&rect.height>0;
    };
    const elements=Array.from(document.querySelectorAll("iframe, [data-sitekey], [aria-label], [role='checkbox']"));
    const elementChallenge=elements.some(el=>{
      if(!visible(el))return false;
      const text=[el.textContent||"",el.getAttribute("src")||"",el.getAttribute("title")||"",el.getAttribute("aria-label")||"",el.getAttribute("data-sitekey")||"",el.getAttribute("role")||""].join(" ");
      return re.test(text);
    });
    const visibleText=document.body?.innerText||"";
    return elementChallenge||textRe.test(visibleText);
  },{element:challengePattern.source,text:visibleChallengeText.source});
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
async function submitForm(page:Page,formIndex:number){
  const form=await page.$(`form[data-baf-form="${formIndex}"]`);
  if(!form)throw new Error("Target form disappeared.");
  const submitter=await form.$('button[type="submit"],input[type="submit"],button:not([type]),button');
  const navigation=page.waitForNavigation({waitUntil:"domcontentloaded",timeout:12000}).catch(()=>null);
  if(submitter){try{await submitter.click({delay:30});}catch{await form.evaluate((el:any)=>el.requestSubmit());}}
  else await form.evaluate((el:any)=>el.requestSubmit());
  await Promise.race([navigation,new Promise(resolve=>setTimeout(resolve,4000))]);
}
async function successSignal(page:Page,beforeUrl:string){
  const currentUrl=page.url();
  const text=await page.evaluate(()=>document.body?.innerText?.slice(0,50000)||"");
  return currentUrl!==beforeUrl||/thank you|thanks for|message sent|successfully sent|submission received|we'll be in touch|we will be in touch/i.test(text);
}
export async function submitContactForm(url:string,details:SenderDetails,dryRun=false):Promise<SubmissionResult>{
  const browser=await launchBrowser();
  try{
    const page=await browser.newPage();
    await page.setUserAgent("BookAirfreightContactFormSender/1.0");
    await page.setDefaultNavigationTimeout(20000);
    await page.goto(url,{waitUntil:"domcontentloaded",timeout:20000});
    const forms=await inspect(page);
    if(!forms.length)return{url,status:"unsupported",message:"No HTML contact form was detected on this page."};
    const challenge=await detectChallenge(page);
    if(challenge)return{url,status:"captcha_required",message:"CAPTCHA or anti-bot challenge detected. Submission skipped and added to the CAPTCHA queue."};
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
      if(item.key==="fullName")value=`${details.firstName} ${details.lastName}`.trim();
      else value=details[item.key];
      if(value)await fillField(page,best.formIndex,item.controlIndex,value);
    }
    if(dryRun)return{url,status:"preview",message:"Form loaded and fields were mapped without submitting.",detectedFields};
    if(await detectChallenge(page))return{url,status:"captcha_required",message:"An anti-bot challenge appeared before submission. Submission skipped and added to the CAPTCHA queue.",detectedFields};
    const beforeUrl=page.url();
    await submitForm(page,best.formIndex);
    const success=await successSignal(page,beforeUrl);
    return{url,status:success?"success":"submitted_unverified",message:success?"Form submitted and a success signal was detected.":"Form was submitted, but a success confirmation could not be verified. Treat as sent and review if needed.",detectedFields};
  }catch(error){return{url,status:"failed",message:error instanceof Error?error.message:"Browser automation failed."};}
  finally{await browser.close().catch(()=>undefined);}
}
