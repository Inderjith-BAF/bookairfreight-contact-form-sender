import { NextResponse } from "next/server";
import { submissionRequestSchema } from "@/lib/validate";
import { submitContactForm } from "@/lib/form-engine";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = submissionRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid URLs or sender details.", issues: parsed.error.flatten() }, { status: 400 });

    const results = [];
    for (const url of parsed.data.urls) results.push(await submitContactForm(url, parsed.data.details));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
