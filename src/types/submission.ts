export type SenderDetails={firstName:string;lastName:string;company:string;email:string;phone:string;subject:string;message:string};

export type SubmissionStatus="success"|"submitted_unverified"|"failed"|"captcha_required"|"unsupported"|"preview";

export type SubmissionEvidence=
  | "Target URL safety check failed"
  | "Form mapping verified"
  | "Submission not attempted"
  | "Client-side form validation failed"
  | "Submission request observed"
  | "Success confirmation detected"
  | "No matching submission request"
  | "No success confirmation"
  | "Target page reported an error"
  | "Target/browser session closed unexpectedly"
  | "Automation error"
  | string;

export type SubmissionResult={
  url:string;
  status:SubmissionStatus;
  message:string;
  detectedFields?:string[];
  evidence?:SubmissionEvidence[];
};