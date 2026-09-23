export type SenderDetails = {
  name: string;
  company: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
};

export type SubmissionStatus = "queued" | "success" | "failed" | "captcha_required" | "unsupported";

export type SubmissionResult = {
  url: string;
  status: SubmissionStatus;
  message: string;
  detectedFields?: string[];
};
