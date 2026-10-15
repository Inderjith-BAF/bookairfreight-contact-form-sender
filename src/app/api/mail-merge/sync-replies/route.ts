import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
import { getProviderAccess } from "@/lib/mail-merge-provider";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
const header = (m: any, name: string) => String((m.payload?.headers || m.internetMessageHeaders || []).find((h: any) => String(h.name).toLowerCase() === name.toLowerCase())?.value || "");
function gmailText(payload: any): string {
  const parts: any[] = [];
  const visit = (part: any) => {
    if (!part) return;
    if (part.body?.data && (part.mimeType === "text/plain" || part.mimeType === "text/html")) {
      try { parts.push(Buffer.from(String(part.body.data), "base64url").toString("utf8")); } catch {}
    }
    for (const child of part.parts || []) visit(child);
  };
  visit(payload);
  return parts.join("\n");
}
const normalized = (value: unknown) => String(value ?? "").trim().toLowerCase();
const subjectKey = (value: unknown) => normalized(value).replace(/^(?:(?:automatic reply|auto-reply|autoreply|out of office|ooo|re|fw|fwd)\s*:\s*)+/i, "").trim();
const isAutoReply = (subject: string, body: string, headers: any[] = []) => {
  const raw = headers.map((item:any) => String(item.name||"")+": "+String(item.value||"")) .join("\n");
  return /^(automatic reply|auto-reply|autoreply|out of office|ooo)(?:\s*[:-]|$)/i.test(subject.trim()) ||
    /auto-submitted\s*:\s*(?!no\b)auto-replied|x-autoreply\s*:\s*(yes|true)|x-autorespond\s*:\s*(yes|true)/i.test(raw) ||
    /I am (currently )?out of (the )?office|automatic reply|auto-reply|this is an automated response/i.test(body);
};
const isBounce = (from: string, subject: string, body: string) =>
  /mailer-daemon|postmaster|mail delivery subsystem|mail delivery agent/i.test(from) ||
  /undeliver(?:ed|able)|delivery status notification|delivery failure|message not delivered|returned mail|delivery has failed|failure notice|bounce/i.test(subject) ||
  (/delivery status notification|recipient address rejected|user unknown|mailbox unavailable/i.test(body) && /failed|undeliver|recipient|address/i.test(body));
function bounceEmails(text: string): string[] {
  const matches = text.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi) || [];
  return [...new Set(matches.map(normalized))];
}
async function recordBounce(admin: any, account: any, sent: any[], leadsById: Map<string, any>, emails: string[], details: any) {
  let count = 0;
  for (const email of emails) {
    const lead = [...leadsById.values()].find((item: any) => normalized(item.email) === email);
    if (!lead) continue;
    const row = sent.find((item: any) => item.lead_id === lead.id && !["Bounced", "Replied", "Suppressed"].includes(String(item.status)));
    if (!row) continue;
    const now = new Date().toISOString();
    // Mark the specific failed attempt as bounced, then immediately stop any other
    // unsent attempts for this lead across campaigns so queued follow-ups cannot linger.
    await admin.from("mail_merge_campaign_recipients").update({ status: "Bounced", error_message: "Delivery failure reported by mailbox", updated_at: now }).eq("id", row.id);
    await admin.from("mail_merge_campaign_recipients").update({ status: "Suppressed", send_not_before: null, error_message: "Lead bounced; removed from pending outreach.", updated_at: now }).eq("lead_id", lead.id).in("status", ["Ready", "Queued", "Sending"]);
    await admin.from("master_leads").update({ current_status: "Bounced", suppression_reason: "Bounce reported by mail provider", suppressed_at: now, updated_at: now }).eq("id", lead.id);
    await admin.from("mail_merge_events").insert({ campaign_recipient_id: row.id, campaign_id: row.campaign_id, lead_id: lead.id, sender_account_id: account.id, event_type: "bounce", details });
    count++;
  }
  return count;
}
export async function POST(request: Request) {
  // Cron-job.org can run this endpoint on a schedule using the same CRON_SECRET as the account dispatcher.
  // Human-triggered sync continues to require a valid outbound session.
  const cronSecret = process.env.CRON_SECRET;
  const isCron = Boolean(cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`);
  let admin: any;
  let profile: any = null;
  if (isCron) {
    const serviceClient = getSupabaseAdmin();
    if (!serviceClient) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
    admin = serviceClient;
  } else {
    const auth = await requireOutboundUser(request);
    if ("error" in auth) return auth.error;
    admin = auth.admin;
    profile = auth.profile;
  }
  const { data: accounts, error: accountsError } = await admin.from("outbound_email_accounts").select("*").eq("active", true).eq("connection_status", "Connected");
  if (accountsError) return NextResponse.json({ error: accountsError.message }, { status: 500 });
  let replies = 0, autoResponses = 0, bounces = 0, checked = 0;
  const errors: string[] = [];
  for (const account of accounts || []) {
    if (profile?.role === "member" && account.employee_id !== profile.id) continue;
    try {
      const access = await getProviderAccess(account, admin);
      let messages: any[] = [];
      if (account.provider === "google") {
        let pageToken = "";
        for (let page = 0; page < 1; page++) {
          const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
          // Include Spam as well as Inbox: automatic replies are often classified as spam.
          url.searchParams.set("includeSpamTrash", "true");
          url.searchParams.set("maxResults", "100");
          url.searchParams.set("q", "{in:inbox in:spam} newer_than:30d");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const r = await fetch(url, { headers: { Authorization: "Bearer " + access } });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error?.message || "Gmail inbox sync failed.");
          // Fetch message details concurrently in small groups to avoid hundreds of serial round trips per mailbox.
          const listed = (d.messages || []).slice(0, 100);
          for (let offset = 0; offset < listed.length; offset += 10) {
            const group = listed.slice(offset, offset + 10);
            const details = await Promise.all(group.map(async (item: any) => {
              const full = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + item.id + "?format=full", { headers: { Authorization: "Bearer " + access } });
              if (!full.ok) return null;
              const x = await full.json();
              return { provider: "google", id: x.id, threadId: x.threadId, from: header(x, "From"), subject: header(x, "Subject"), headers: x.payload?.headers || [], body: gmailText(x.payload), snippet: String(x.snippet || "") };
            }));
            messages.push(...details.filter(Boolean));
          }
          pageToken = String(d.nextPageToken || "");
          if (!pageToken) break;
        }
      } else {
        // Scan both Inbox and Junk Email; automatic replies can be classified as junk.
        for (const folder of ["inbox", "junkemail"]) {
          const url = "https://graph.microsoft.com/v1.0/me/mailFolders/" + folder + "/messages?$top=100&$select=id,subject,from,receivedDateTime,internetMessageId,internetMessageHeaders,body&$orderby=receivedDateTime%20desc";
          const r = await fetch(url, { headers: { Authorization: "Bearer " + access, Prefer: 'outlook.body-content-type="text"' } });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error?.message || ("Microsoft " + folder + " sync failed."));
          messages.push(...(d.value || []).slice(0, 100).map((m: any) => ({ provider: "microsoft", id: m.id, from: String(m.from?.emailAddress?.address || ""), subject: String(m.subject || ""), headers: m.internetMessageHeaders || [], body: String(m.body?.content || ""), snippet: "" })));
        }
      }
      checked += messages.length;
      const { data: sent, error: sentError } = await admin.from("mail_merge_campaign_recipients")
        .select("id,campaign_id,lead_id,sender_account_id,provider_thread_id,provider_message_id,status,subject,created_at")
        .eq("sender_account_id", account.id).in("status", ["Sent", "Replied", "Auto Response", "Bounced"])
        .order("created_at", { ascending: false }).limit(2000);
      if (sentError) throw new Error(sentError.message);
      const leadIds = [...new Set((sent || []).map((row: any) => row.lead_id))];
      const { data: leads, error: leadsError } = leadIds.length
        ? await admin.from("master_leads").select("id,email,current_status").in("id", leadIds)
        : { data: [], error: null };
      if (leadsError) throw new Error(leadsError.message);
      const leadsById = new Map<string, any>((leads || []).map((lead: any) => [String(lead.id), lead] as [string, any]));
      const leadIdByEmail = new Map<string, string>((leads || []).map((lead: any) => [normalized(lead.email), String(lead.id)] as [string, string]));
      // Rows are ordered newest-first; preserve the newest campaign recipient for a shared provider thread.\n      const threadMap = new Map<string, any>();\n      for (const row of sent || []) {\n        const threadId = String(row.provider_thread_id || "");\n        if (threadId && !threadMap.has(threadId)) threadMap.set(threadId, row);\n      }
      for (const message of messages) {
        const from = normalized(message.from);
        const subject = String(message.subject || "");
        const body = String(message.body || "") + "\n" + String(message.snippet || "");
        if (isBounce(from, subject, body)) {
          // The failed recipient is normally embedded in the delivery report body.
          const candidates = bounceEmails(body).filter(email => leadIdByEmail.has(email));
          bounces += await recordBounce(admin, account, sent || [], leadsById, candidates, { source: account.provider + "_inbox_sync", from: message.from, subject, message_id: message.id });
          continue;
        }
        let row: any;
        const senderEmail = from.match(/[A-Z0-9.!#$%&'*+/=?^`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || "";
        const leadId = leadIdByEmail.get(senderEmail);
        if (!leadId || senderEmail === normalized(account.email)) continue;
        // Automatic responses are tracked separately and never count as human replies.
        if (isAutoReply(subject, body, message.headers || [])) {
          const threadMatch = account.provider === "google" ? threadMap.get(message.threadId) : null;
          const autoRow = threadMatch?.lead_id === leadId
            ? threadMatch
            : (sent || []).find((item: any) =>
                item.lead_id === leadId &&
                subjectKey(item.subject) === subjectKey(subject) &&
                !["Bounced", "Suppressed"].includes(String(item.status))
              );
          const now = new Date().toISOString();
          if (autoRow && !["Bounced", "Suppressed", "Auto Response"].includes(String(autoRow.status))) {
            await admin.from("mail_merge_campaign_recipients").update({ status: "Auto Response", updated_at: now }).eq("id", autoRow.id);
            await admin.from("mail_merge_events").insert({
              campaign_recipient_id: autoRow.id,
              campaign_id: autoRow.campaign_id,
              lead_id: autoRow.lead_id,
              sender_account_id: account.id,
              event_type: "auto_reply",
              details: { source: account.provider + "_inbox_sync", from: message.from, subject, message_id: message.id }
            });
          }
          const knownLead = leadsById.get(leadId);
          if (knownLead?.current_status !== "Out of Office") {
            await admin.from("master_leads").update({ current_status: "Out of Office", last_replied_at: now, updated_at: now }).eq("id", leadId);
            knownLead.current_status = "Out of Office";
          }
          autoResponses++;
          continue;
        }
        // Prefer Gmail thread matching, then fall back to sender + normalized subject.
        // This catches auto-replies that Gmail stores in a separate thread.
        const threadMatch = account.provider === "google" ? threadMap.get(message.threadId) : null;
        row = threadMatch?.lead_id === leadId && !["Bounced", "Suppressed"].includes(String(threadMatch.status))
          ? threadMatch
          : (sent || []).find((item: any) =>
              item.lead_id === leadId &&
              subjectKey(item.subject) === subjectKey(subject) &&
              !["Bounced", "Suppressed"].includes(String(item.status))
            );
        if (!row || ["Replied", "Bounced", "Suppressed"].includes(String(row.status))) continue;
        const now = new Date().toISOString();
        await admin.from("mail_merge_campaign_recipients").update({ status: "Replied", updated_at: now }).eq("id", row.id);
        await admin.from("master_leads").update({ current_status: "Needs Review", last_replied_at: now, updated_at: now }).eq("id", row.lead_id);
        await admin.from("mail_merge_events").insert({ campaign_recipient_id: row.id, campaign_id: row.campaign_id, lead_id: row.lead_id, sender_account_id: account.id, event_type: "reply", details: { source: account.provider + "_inbox_sync", from: message.from, subject, message_id: message.id } });
        replies++;
      }
    } catch (error) {
      errors.push(account.email + ": " + (error instanceof Error ? error.message : "Mailbox sync failed"));
      // A failed inbox sync must not mark a healthy OAuth connection as disconnected.
      await admin.from("outbound_email_accounts").update({ connection_error: errors[errors.length - 1] }).eq("id", account.id);
    }
  }
  const parts = [];
  if (replies) parts.push("synced " + replies + " replies");
  if (autoResponses) parts.push("classified " + autoResponses + " automatic responses");
  if (bounces) parts.push("recorded " + bounces + " bounces");
  if (!parts.length) parts.push("no new replies or bounces found");
  return NextResponse.json({ matched: replies, replies, autoResponses, bounces, checked, errors, message: parts.join("; ") + "." });
}
