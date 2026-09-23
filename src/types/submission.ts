export type SenderDetails={firstName:string;lastName:string;company:string;email:string;phone:string;subject:string;message:string};
export type SubmissionStatus="success"|"failed"|"captcha_required"|"unsupported"|"preview";
export type SubmissionResult={url:string;status:SubmissionStatus;message:string;detectedFields?:string[]};
