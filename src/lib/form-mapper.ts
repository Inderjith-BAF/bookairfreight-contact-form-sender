export type FormFieldKey="firstName"|"lastName"|"fullName"|"company"|"email"|"phone"|"subject"|"message";

export type FormControl={
  tag:string;
  type:string;
  name:string;
  id:string;
  placeholder:string;
  autocomplete:string;
  label:string;
  required?:boolean;
};

export type FormDescriptor={
  formIndex:number;
  controls:FormControl[];
  action:string;
  method:string;
  formType:string;
  shopifyContact:boolean;
};

export type FieldMatch={
  key:FormFieldKey;
  controlIndex:number;
  score:number;
  reasons:string[];
};

const aliases:Record<FormFieldKey,string[]>={
  firstName:["first_name","firstname","first-name","given_name","givenname","given-name","forename"],
  lastName:["last_name","lastname","last-name","surname","family_name","familyname","family-name"],
  fullName:["full_name","fullname","full-name","contact_name","contact-name","your-name","name"],
  company:["company","company_name","organization","organisation","business","companyname"],
  email:["email","email_address","e-mail","your-email","mail"],
  phone:["phone","telephone","tel","mobile","phone_number","contact_number","whatsapp"],
  subject:["subject","topic","enquiry_subject","inquiry_subject"],
  message:["message","comments","comment","enquiry","inquiry","description","your-message","details","body"]
};

function norm(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}

function scoreControl(control:FormControl,key:FormFieldKey){
  const parts=[control.name,control.id,control.placeholder,control.autocomplete,control.label];
  const hay=norm(parts.join(" "));
  let score=0;
  const reasons:string[]=[];
  for(const alias of aliases[key]){
    const a=norm(alias);
    if(!a)continue;
    if(hay===a){score+=100;reasons.push("exact semantic match");}
    else if(hay.split(" ").includes(a)){score+=65;reasons.push("semantic token match");}
    else if(hay.includes(a)){score+=30;reasons.push("semantic substring match");}
  }
  if(key==="email"&&control.type==="email"){score+=35;reasons.push("email input type");}
  if(key==="phone"&&(control.type==="tel"||control.autocomplete==="tel")){score+=35;reasons.push("telephone input metadata");}
  if(key==="message"&&control.tag==="textarea"){score+=30;reasons.push("textarea");}
  if(control.required)score+=3;
  return {score,reasons:[...new Set(reasons)]};
}

export function mapContactForm(form:FormDescriptor){
  const used=new Set<number>();
  const matches:FieldMatch[]=[];
  const order:FormFieldKey[]=["firstName","lastName","fullName","email","phone","company","subject","message"];

  for(const key of order){
    let best:FieldMatch|undefined;
    form.controls.forEach((control,controlIndex)=>{
      if(used.has(controlIndex))return;
      const scored=scoreControl(control,key);
      if(scored.score<30)return;
      const candidate={key,controlIndex,score:scored.score,reasons:scored.reasons};
      if(!best||candidate.score>best.score)best=candidate;
    });
    if(best){matches.push(best);used.add(best.controlIndex);}
  }

  const keys=new Set(matches.map(match=>match.key));
  const hasName=keys.has("firstName")||keys.has("lastName")||keys.has("fullName");
  const contactLike=(keys.has("email")&&keys.has("message"))||(hasName&&keys.has("email"))||(hasName&&keys.has("message")&&matches.length>=3);

  return {
    supported:contactLike,
    matches,
    detectedFields:matches.map(match=>match.key),
    score:matches.reduce((sum,match)=>sum+match.score,0)
  };
}

export function chooseBestContactForm(forms:FormDescriptor[]){
  let best:{form:FormDescriptor;mapping:ReturnType<typeof mapContactForm>}|null=null;
  for(const form of forms){
    const mapping=mapContactForm(form);
    if(!mapping.supported)continue;
    if(!best||mapping.score>best.mapping.score)best={form,mapping};
  }
  return best;
}
