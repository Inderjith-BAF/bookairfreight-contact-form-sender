import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
import { getProviderAccess } from "@/lib/mail-merge-provider";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;
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
async function recordBounce(admin: any, account: any, sentByLead: Map<string, any>, leadsByEmail: Map<string, any>, emails: string[], details: any) {
  let count = 0;
  for (const email of emails) {
    const lead = leadsByEmail.get(email);
    if (!lead) continue;
    const row = (sentByLead.get(String(lead.id)) || []).find((item: any) => !["Bounced", "Replied", "Suppressed"].includes(String(item.status)));
    if (!row) continue;
    const now = new Date().toISOString();
    // Mark the specific failed attempt as bounced, then immediately stop any other
    // unsent attempts for this lead across campaigns so queued follow-ups cannot linger.
    const { error: bouncedError } = await admin.from("mail_merge_campaign_recipients").update({ status: "Bounced", error_message: "Delivery failure reported by mailbox", updated_at: now }).eq("id", row.id);
    if (bouncedError) throw new Error("Could not mark bounced recipient: " + bouncedError.message);
    const { error: suppressError } = await admin.from("mail_merge_campaign_recipients").update({ status: "Suppressed", send_not_before: null, error_message: "Lead bounced; removed from pending outreach.", updated_at: now }).eq("lead_id", lead.id).in("status", ["Ready", "Queued", "Sending"]);
    if (suppressError) throw new Error("Could not suppress bounced lead follow-ups: " + suppressError.message);
    const { error: leadBounceError } = await admin.from("master_leads").update({ current_status: "Bounced", suppression_reason: "Bounce reported by mail provider", suppressed_at: now, updated_at: now }).eq("id", lead.id);
    if (leadBounceError) throw new Error("Could not update bounced lead: " + leadBounceError.message);
    const { error: bounceEventError } = await admin.from("mail_merge_events").insert({ campaign_recipient_id: row.id, campaign_id: row.campaign_id, lead_id: lead.id, sender_account_id: account.id, event_type: "bounce", details });
    if (bounceEventError) throw new Error("Could not record bounce event: " + bounceEventError.message);
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
      const { data: syncClaimed, error: syncClaimError } = await admin.rpc("claim_mailbox_sync", { p_account_id: account.id });
      if (syncClaimError) throw new Error("Could not claim mailbox sync: " + syncClaimError.message);
      if (!syncClaimed) continue;
      const access = await getProviderAccess(account, admin);
      let messages: any[] = [];
      const pendingCursors: Record<string, string> = {};
      const fetchGmailMessage = async (id: string) => {
        const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(id) + "?format=full", { headers: { Authorization: "Bearer " + access } });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || "Could not read Gmail message " + id);
        const labels: string[] = Array.isArray(payload.labelIds) ? payload.labelIds : [];
        if (!labels.includes("INBOX") && !labels.includes("SPAM")) return null;
        return { provider: "google", id: payload.id, threadId: payload.threadId, from: header(payload, "From"), subject: header(payload, "Subject"), headers: payload.payload?.headers || [], body: gmailText(payload.payload), snippet: String(payload.snippet || "") };
      };
      if (account.provider === "google") {
        let historyId = String(account.gmail_history_id || "");
        let ids = new Set<string>();
        if (historyId) {
          let pageToken = "";
          let latestHistoryId = historyId;
          try {
            do {
              const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
              url.searchParams.set("startHistoryId", historyId);
              url.searchParams.set("historyTypes", "messageAdded");
              url.searchParams.set("maxResults", "500");
              if (pageToken) url.searchParams.set("pageToken", pageToken);
              const response = await fetch(url, { headers: { Authorization: "Bearer " + access } });
              const data = await response.json();
              if (!response.ok) {
                if (response.status === 404) throw Object.assign(new Error("GMAIL_HISTORY_EXPIRED"), { code: "GMAIL_HISTORY_EXPIRED" });
                throw new Error(data.error?.message || "Gmail History API sync failed.");
              }
              latestHistoryId = String(data.historyId || latestHistoryId);
              for (const history of data.history || []) for (const added of history.messagesAdded || []) if (added.message?.id) ids.add(String(added.message.id));
              pageToken = String(data.nextPageToken || "");
            } while (pageToken);
            pendingCursors.gmail_history_id = latestHistoryId;
          } catch (error: any) {
            if (error?.code !== "GMAIL_HISTORY_EXPIRED") throw error;
            historyId = "";
            ids.clear();
          }
        }
        if (!historyId) {
          // Establish the history baseline before the bootstrap scan. Any messages
          // arriving during the scan are then replayed by the next History request.
          const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: "Bearer " + access } });
          const profileData = await profileResponse.json();
          if (!profileResponse.ok || !profileData.historyId) throw new Error(profileData.error?.message || "Could not establish Gmail history baseline.");
          const baseline = String(profileData.historyId);
          let pageToken = "";
          do {
            const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
            url.searchParams.set("includeSpamTrash", "true");
            url.searchParams.set("maxResults", "500");
            url.searchParams.set("q", "{in:inbox in:spam} newer_than:30d");
            if (pageToken) url.searchParams.set("pageToken", pageToken);
            const response = await fetch(url, { headers: { Authorization: "Bearer " + access } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || "Gmail mailbox bootstrap failed.");
            for (const item of data.messages || []) if (item.id) ids.add(String(item.id));
            pageToken = String(data.nextPageToken || "");
          } while (pageToken);
          pendingCursors.gmail_history_id = baseline;
        }
        const allIds = [...ids];
        for (let offset = 0; offset < allIds.length; offset += 10) {
          const batch = await Promise.all(allIds.slice(offset, offset + 10).map(fetchGmailMessage));
          messages.push(...batch.filter(Boolean));
        }
      } else if (account.provider === "microsoft") {
        const folders = [
          { key: "graph_inbox_delta_link", name: "inbox" },
          { key: "graph_junk_delta_link", name: "junkemail" }
        ];
        const seen = new Set<string>();
        for (const folder of folders) {
          const usingSavedCursor = Boolean(account[folder.key]);
          let restartedExpiredCursor = false;
          let url: string | null = usingSavedCursor
            ? String(account[folder.key])
            : "https://graph.microsoft.com/v1.0/me/mailFolders/" + folder.name + "/messages/delta?$top=100&$select=id,subject,from,receivedDateTime,internetMessageId,internetMessageHeaders,body";
          let deltaLink = "";
          while (url) {
            const response: Response = await fetch(url, { headers: { Authorization: "Bearer " + access, Prefer: 'outlook.body-content-type="text"' } });
            const data = await response.json();
            if (!response.ok) {
              // An expired delta token must not replace the saved cursor. Retry a
              // clean folder bootstrap and only commit its new deltaLink on success.
              const expired = response.status === 410 || (response.status === 400 && /sync state|delta token|resync/i.test(JSON.stringify(data)));
              if (expired && usingSavedCursor && !restartedExpiredCursor) {
                restartedExpiredCursor = true;
                url = "https://graph.microsoft.com/v1.0/me/mailFolders/" + folder.name + "/messages/delta?$top=100&$select=id,subject,from,receivedDateTime,internetMessageId,internetMessageHeaders,body";
                deltaLink = "";
                continue;
              }
              throw new Error(data.error?.message || ("Microsoft " + folder.name + " delta sync failed."));
            }
            for (const item of data.value || []) {
              if (item["@removed"] || !item.id || seen.has(String(item.id))) continue;
              seen.add(String(item.id));
              messages.push({ provider: "microsoft", id: String(item.id), from: String(item.from?.emailAddress?.address || ""), subject: String(item.subject || ""), headers: item.internetMessageHeaders || [], body: String(item.body?.content || ""), snippet: "" });
            }
            if (typeof data["@odata.deltaLink"] === "string") deltaLink = data["@odata.deltaLink"];
            url = typeof data["@odata.nextLink"] === "string" ? data["@odata.nextLink"] : null;
          }
          if (!deltaLink) throw new Error("Microsoft " + folder.name + " delta response did not include a final deltaLink.");
          pendingCursors[folder.key] = deltaLink;
        }
      } else {
        throw new Error("Unsupported mailbox provider: " + String(account.provider));
      }
      checked += messages.length;
      // Resolve only leads actually mentioned by this mailbox scan. The previous
      // implementation loaded up to 50,000 sent recipients for every account,
      // even when the inbox contained only a handful of messages.
      const candidateEmails = new Set<string>();
      for (const message of messages) {
        const from = String(message.from || "").match(/[A-Z0-9.!#$%&'*+/=?^`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
        if (from) candidateEmails.add(normalized(from));
        if (isBounce(normalized(message.from), String(message.subject || ""), String(message.body || "") + "\n" + String(message.snippet || ""))) {
          for (const email of bounceEmails(String(message.body || "") + "\n" + String(message.snippet || ""))) candidateEmails.add(email);
        }
      }
      const candidateList = [...candidateEmails];
      const leads: any[] = [];
      for (let offset = 0; offset < candidateList.length; offset += 500) {
        const { data: leadRows, error: leadsError } = await admin.from("master_leads")
          .select("id,email,current_status").in("normalized_email", candidateList.slice(offset, offset + 500));
        if (leadsError) throw new Error(leadsError.message);
        leads.push(...(leadRows || []));
      }
      const leadIds = [...new Set(leads.map((lead: any) => String(lead.id)))];
      const sent: any[] = [];
      for (let offset = 0; offset < leadIds.length; offset += 500) {
        const { data: sentRows, error: sentError } = await admin.from("mail_merge_campaign_recipients")
          .select("id,campaign_id,lead_id,sender_account_id,provider_thread_id,provider_message_id,status,subject,created_at")
          .eq("sender_account_id", account.id).in("status", ["Sent", "Replied", "Auto Response", "Bounced"])
          .in("lead_id", leadIds.slice(offset, offset + 500))
          .order("created_at", { ascending: false });
        if (sentError) throw new Error(sentError.message);
        sent.push(...(sentRows || []));
      }
      const leadIdByEmail = new Map<string, string>((leads || []).map((lead: any) => [normalized(lead.email), String(lead.id)] as [string, string]));
      const leadsByEmail = new Map<string, any>((leads || []).map((lead: any) => [normalized(lead.email), lead] as [string, any]));
      const leadsById = new Map<string, any>((leads || []).map((lead: any) => [String(lead.id), lead] as [string, any]));
      const sentByLead = new Map<string, any[]>();
      const sentByLeadSubject = new Map<string, any>();
      for (const row of sent || []) {
        const leadKey = String(row.lead_id || "");
        const list = sentByLead.get(leadKey) || [];
        list.push(row);
        sentByLead.set(leadKey, list);
        const key = leadKey + "::" + subjectKey(row.subject);
        if (!sentByLeadSubject.has(key)) sentByLeadSubject.set(key, row);
      }
      // Rows are ordered newest-first; preserve the newest campaign recipient for a shared provider thread.
      const threadMap = new Map<string, any>();
      for (const row of sent || []) {
        const threadId = String(row.provider_thread_id || "");
        if (threadId && !threadMap.has(threadId)) threadMap.set(threadId, row);
      }
      for (const message of messages) {
        const from = normalized(message.from);
        const subject = String(message.subject || "");
        const body = String(message.body || "") + "\n" + String(message.snippet || "");
        if (isBounce(from, subject, body)) {
          // The failed recipient is normally embedded in the delivery report body.
          const candidates = bounceEmails(body).filter(email => leadIdByEmail.has(email));
          bounces += await recordBounce(admin, account, sentByLead, leadsByEmail, candidates, { source: account.provider + "_inbox_sync", from: message.from, subject, message_id: message.id });
          continue;
        }
        let row: any;
        const senderEmail = from.match(/[A-Z0-9.!#$%&'*+/=?^`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || "";
        const leadId = leadIdByEmail.get(senderEmail);
        if (!leadId || senderEmail === normalized(account.email)) continue;
        // Automatic responses are tracked separately and never count as human replies.
        if (isAutoReply(subject, body, message.headers || [])) {
          const threadMatch = account.provider === "google" ? threadMap.get(message.threadId) : null;
          const subjectMatch = sentByLeadSubject.get(leadId + "::" + subjectKey(subject));
          const autoRow = threadMatch?.lead_id === leadId && !["Bounced", "Suppressed"].includes(String(threadMatch.status))
            ? threadMatch
            : (subjectMatch && !["Bounced", "Suppressed"].includes(String(subjectMatch.status)) ? subjectMatch : undefined);
          const now = new Date().toISOString();
          if (autoRow && !["Bounced", "Suppressed", "Auto Response"].includes(String(autoRow.status))) {
            const { error: autoStatusError } = await admin.from("mail_merge_campaign_recipients").update({ status: "Auto Response", updated_at: now }).eq("id", autoRow.id);
            if (autoStatusError) throw new Error("Could not classify automatic response: " + autoStatusError.message);
            const { error: autoEventError } = await admin.from("mail_merge_events").insert({
              campaign_recipient_id: autoRow.id,
              campaign_id: autoRow.campaign_id,
              lead_id: autoRow.lead_id,
              sender_account_id: account.id,
              event_type: "auto_reply",
              details: { source: account.provider + "_inbox_sync", from: message.from, subject, message_id: message.id }
            });
            if (autoEventError) throw new Error("Could not record automatic response event: " + autoEventError.message);
          }
          const knownLead = leadsById.get(leadId);
          if (knownLead?.current_status !== "Out of Office") {
            const { error: leadAutoError } = await admin.from("master_leads").update({ current_status: "Out of Office", last_replied_at: now, updated_at: now }).eq("id", leadId);
            if (leadAutoError) throw new Error("Could not update out-of-office lead: " + leadAutoError.message);
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
          : (() => { const match = sentByLeadSubject.get(leadId + "::" + subjectKey(subject)); return match && !["Bounced", "Suppressed"].includes(String(match.status)) ? match : undefined; })();
        if (!row || ["Bounced", "Suppressed"].includes(String(row.status))) continue;
        const now = new Date().toISOString();
        const { error: replyStatusError } = await admin.from("mail_merge_campaign_recipients").update({ status: "Replied", updated_at: now }).eq("id", row.id);
        if (replyStatusError) throw new Error("Could not mark recipient as replied: " + replyStatusError.message);
        const { error: leadReplyError } = await admin.from("master_leads").update({ current_status: "Needs Review", last_replied_at: now, updated_at: now }).eq("id", row.lead_id);
        if (leadReplyError) throw new Error("Could not move replied lead to Needs Review: " + leadReplyError.message);
        const { data: existingReplyEvent, error: existingReplyEventError } = await admin.from("mail_merge_events")
          .select("id").eq("campaign_recipient_id", row.id).eq("event_type", "reply")
          .contains("details", { message_id: message.id }).limit(1);
        if (existingReplyEventError) throw new Error("Could not check existing reply event: " + existingReplyEventError.message);
        if (!existingReplyEvent?.length) {
          const { error: replyEventError } = await admin.from("mail_merge_events").insert({ campaign_recipient_id: row.id, campaign_id: row.campaign_id, lead_id: row.lead_id, sender_account_id: account.id, event_type: "reply", details: { source: account.provider + "_inbox_sync", from: message.from, subject, message_id: message.id } });
          if (replyEventError) throw new Error("Could not record reply event: " + replyEventError.message);
        }
        replies++;
      }
      // Advance provider cursors only after all fetched messages have been
      // classified and every required database write has succeeded. If anything
      // above fails, the next run replays this same provider window.
      if (Object.keys(pendingCursors).length) {
        const { error: cursorError } = await admin.from("outbound_email_accounts").update(pendingCursors).eq("id", account.id);
        if (cursorError) throw new Error("Could not save mailbox sync cursor: " + cursorError.message);
      }
      const { error: syncCompleteError } = await admin.from("outbound_email_accounts")
        .update({ mailbox_last_synced_at: new Date().toISOString(), mailbox_sync_started_at: null, mailbox_sync_error: null })
        .eq("id", account.id);
      if (syncCompleteError) throw new Error("Could not finalize mailbox sync: " + syncCompleteError.message);
    } catch (error) {
      errors.push(account.email + ": " + (error instanceof Error ? error.message : "Mailbox sync failed"));
      // A failed inbox sync must not mark a healthy OAuth connection as disconnected.
      await admin.from("outbound_email_accounts").update({ connection_error: errors[errors.length - 1], mailbox_sync_error: errors[errors.length - 1], mailbox_sync_started_at: null }).eq("id", account.id);
    }
  }
  const parts = [];
  if (replies) parts.push("synced " + replies + " replies");
  if (autoResponses) parts.push("classified " + autoResponses + " automatic responses");
  if (bounces) parts.push("recorded " + bounces + " bounces");
  if (!parts.length) parts.push("no new replies or bounces found");
  return NextResponse.json({ matched: replies, replies, autoResponses, bounces, checked, errors, message: parts.join("; ") + "." });
}
