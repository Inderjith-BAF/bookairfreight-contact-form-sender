import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
import { getProviderAccess } from "@/lib/mail-merge-provider";

export const runtime = "nodejs";
const header = (m: any, name: string) => String((m.payload?.headers || []).find((h: any) => String(h.name).toLowerCase() === name.toLowerCase())?.value || "");
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
const subjectKey = (value: unknown) => normalized(value).replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, "").trim();
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
    await admin.from("mail_merge_campaign_recipients").update({ status: "Bounced", error_message: "Delivery failure reported by mailbox", updated_at: now }).eq("id", row.id);
    await admin.from("master_leads").update({ current_status: "Bounced", suppression_reason: "Bounce reported by mail provider", suppressed_at: now, updated_at: now }).eq("id", lead.id);
    await admin.from("mail_merge_events").insert({ campaign_recipient_id: row.id, campaign_id: row.campaign_id, lead_id: lead.id, sender_account_id: account.id, event_type: "bounce", details });
    count++;
  }
  return count;
}
export async function POST(request: Request) {
  const auth = await requireOutboundUser(request);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const { data: accounts, error: accountsError } = await admin.from("outbound_email_accounts").select("*").eq("active", true).eq("connection_status", "Connected");
  if (accountsError) return NextResponse.json({ error: accountsError.message }, { status: 500 });
  let replies = 0, bounces = 0, checked = 0;
  const errors: string[] = [];
  for (const account of accounts || []) {
    if (profile.role === "member" && account.employee_id !== profile.id) continue;
    try {
      const access = await getProviderAccess(account, admin);
      let messages: any[] = [];
      if (account.provider === "google") {
        let pageToken = "";
        for (let page = 0; page < 5; page++) {
          const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
          url.searchParams.set("labelIds", "INBOX");
          url.searchParams.set("maxResults", "100");
          url.searchParams.set("q", "newer_than:30d");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const r = await fetch(url, { headers: { Authorization: "Bearer " + access } });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error?.message || "Gmail inbox sync failed.");
          for (const item of d.messages || []) {
            const full = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + item.id + "?format=full", { headers: { Authorization: "Bearer " + access } });
            const x = await full.json();
            if (full.ok) messages.push({ provider: "google", id: x.id, threadId: x.threadId, from: header(x, "From"), subject: header(x, "Subject"), body: gmailText(x.payload), snippet: String(x.snippet || "") });
          }
          pageToken = String(d.nextPageToken || "");
          if (!pageToken) break;
        }
      } else {
        let next = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=100&$select=id,subject,from,receivedDateTime,internetMessageId,body&$orderby=receivedDateTime%20desc";
        for (let page = 0; page < 5 && next; page++) {
          const r = await fetch(next, { headers: { Authorization: "Bearer " + access, Prefer: 'outlook.body-content-type="text"' } });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error?.message || "Microsoft inbox sync failed.");
          messages.push(...(d.value || []).map((m: any) => ({ provider: "microsoft", id: m.id, from: String(m.from?.emailAddress?.address || ""), subject: String(m.subject || ""), body: String(m.body?.content || ""), snippet: "" })));
          next = String(d["@odata.nextLink"] || "");
        }
      }
      checked += messages.length;
      const { data: sent, error: sentError } = await admin.from("mail_merge_campaign_recipients")
        .select("id,campaign_id,lead_id,sender_account_id,provider_thread_id,provider_message_id,status,subject,created_at")
        .eq("sender_account_id", account.id).in("status", ["Sent", "Replied", "Bounced"])
        .order("created_at", { ascending: false }).limit(2000);
      if (sentError) throw new Error(sentError.message);
      const leadIds = [...new Set((sent || []).map((row: any) => row.lead_id))];
      const { data: leads, error: leadsError } = leadIds.length
        ? await admin.from("master_leads").select("id,email").in("id", leadIds)
        : { data: [], error: null };
      if (leadsError) throw new Error(leadsError.message);
      const leadsById = new Map((leads || []).map((lead: any) => [lead.id, lead]));
      const leadIdByEmail = new Map((leads || []).map((lead: any) => [normalized(lead.email), lead.id]));
      const threadMap = new Map((sent || []).filter((row: any) => row.provider_thread_id).map((row: any) => [row.provider_thread_id, row]));
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
        if (account.provider === "google") {
          row = threadMap.get(message.threadId);
          if (!row || row.status === "Replied" || row.status === "Bounced") continue;
          const lead = leadsById.get(row.lead_id);
          if (!lead || !leadIdByEmail.has(normalized(lead.email))) continue;
          if (from.includes(normalized(account.email)) || !leadIdByEmail.has(from.match(/[A-Z0-9.!#$%&'*+/=?^`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || "")) continue;
        } else {
          const senderEmail = from.match(/[A-Z0-9.!#$%&'*+/=?^`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || "";
          const leadId = leadIdByEmail.get(senderEmail);
          if (!leadId) continue;
          row = (sent || []).find((item: any) => item.lead_id === leadId && subjectKey(item.subject) === subjectKey(subject) && item.status !== "Bounced");
          if (!row || row.status === "Replied") continue;
        }
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
  if (bounces) parts.push("recorded " + bounces + " bounces");
  if (!parts.length) parts.push("no new replies or bounces found");
  return NextResponse.json({ matched: replies, replies, bounces, checked, errors, message: parts.join("; ") + "." });
}
