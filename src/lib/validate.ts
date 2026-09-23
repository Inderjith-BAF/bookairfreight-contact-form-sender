import { z } from "zod";

export const senderDetailsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(50),
  subject: z.string().trim().max(300),
  message: z.string().trim().min(1).max(10000)
});

export const submissionRequestSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(100),
  details: senderDetailsSchema
});
