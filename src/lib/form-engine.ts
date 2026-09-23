import type { SenderDetails, SubmissionResult } from "@/types/submission";

/**
 * Initial server-side submission boundary.
 *
 * The production engine will inspect each target form, map fields using labels,
 * names and autocomplete attributes, then submit only forms that can be handled
 * normally. CAPTCHA/anti-bot challenges are reported for manual completion and
 * are never bypassed.
 */
export async function submitContactForm(url: string, _details: SenderDetails): Promise<SubmissionResult> {
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(15_000) });
    const html = await response.text();
    const lower = html.toLowerCase();

    if (/captcha|recaptcha|hcaptcha|turnstile/.test(lower)) {
      return { url, status: "captcha_required", message: "A CAPTCHA or anti-bot challenge was detected. Manual completion is required." };
    }

    if (!/<form\b/i.test(html)) {
      return { url, status: "unsupported", message: "No HTML form was detected on the supplied URL." };
    }

    return {
      url,
      status: "failed",
      message: "Form detected, but automatic submission is not enabled in this initial build. The next phase will add field mapping and submission handling."
    };
  } catch (error) {
    return { url, status: "failed", message: error instanceof Error ? error.message : "Unable to reach the target URL." };
  }
}
