import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
import { sendThroughProvider } from "@/lib/mail-merge-provider";
import { signTrackingToken } from "@/lib/mail-merge-tracking";

export const runtime = "nodejs";
export const maxDuration = 60;

const blockedStatuses = ["Bounced", "Unsubscribed", "Suppressed", "Positive", "Neutral", "Negative"];

export async function POST(request: Request) {
  const auth = await requireOutboundUser(request);
  if ("error" in auth) return auth.error;

  const { admin, profile } = auth;
  const body = await request.json().catch(() => null);
  const campaignId = String(body?.campaignId || "");

  if (!campaignId) {
    return NextResponse.json({ error: "Campaign ID is required." }, { status: 400 });
  }

  const { data: campaign, error: campaignError } = await admin
    .from("mail_merge_campaigns")
    .select("id,created_by")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: campaignError?.message || "Campaign not found." }, { status: 404 });
  }

  if (profile.role === "member" && campaign.created_by !== profile.id) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { data: rows, error } = await admin
    .from("mail_merge_campaign_recipients")
    .select("*,master_leads(*),outbound_email_accounts(*)")
    .eq("campaign_id", campaignId)
    .eq("status", "Queued")
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) {
    return NextResponse.json({ error: "No queued recipients are ready to send." }, { status: 409 });
  }

  let sent = 0;
  let failed = 0;
  let suppressed = 0;

  for (const row of rows) {
    const lead = row.master_leads;
    const account = row.outbound_email_accounts;

    if (!account || account.connection_status !== "Connected" || !account.refresh_token_encrypted) {
      await admin
        .from("mail_merge_campaign_recipients")
        .update({
          status: "Failed",
          error_message: "Sending account is not connected. Reconnect the mailbox before dispatch.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      failed++;
      continue;
    }

    if (!lead || lead.suppression_reason || blockedStatuses.includes(lead.current_status)) {
      await admin
        .from("mail_merge_campaign_recipients")
        .update({
          status: "Suppressed",
          error_message: "Suppressed before dispatch.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      suppressed++;
      continue;
    }

    await admin
      .from("mail_merge_campaign_recipients")
      .update({ status: "Sending", updated_at: new Date().toISOString() })
      .eq("id", row.id);

    try {
      const { data: previousRows, error: previousError } = await admin
        .from("mail_merge_campaign_recipients")
        .select("id,subject,provider_message_id,provider_thread_id,sent_at")
        .eq("lead_id", lead.id)
        .eq("sender_account_id", row.sender_account_id)
        .in("status", ["Sent", "Replied"])
        .not("provider_message_id", "is", null)
        .neq("id", row.id)
        .order("sent_at", { ascending: false })
        .limit(1);

      if (previousError) throw new Error(previousError.message);

      const previous = previousRows?.[0];
      const sameSubject =
        previous &&
        String(previous.subject || "").trim().toLowerCase() === String(row.subject || "").trim().toLowerCase();

      const origin = new URL(request.url).origin;
      const trackingBase = (process.env.MAIL_MERGE_TRACKING_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || origin) + "/api/mail-merge/track";
      const trackingToken = signTrackingToken(String(row.id));

      const response = await sendThroughProvider(
        account,
        {
          to: lead.email,
          subject: String(row.subject || ""),
          body: String(row.body || ""),
          trackingBase,
          trackingToken,
          replyToMessageId: sameSubject ? String(previous.provider_message_id) : undefined,
          replyToThreadId: sameSubject ? String(previous.provider_thread_id || "") : undefined,
        },
        admin,
      );

      const now = new Date().toISOString();
      const providerId = String(response.messageId || "");
      const providerThreadId = String(response.threadId || "");

      await admin
        .from("mail_merge_campaign_recipients")
        .update({
          status: "Sent",
          sent_at: now,
          provider_message_id: providerId,
          provider_thread_id: providerThreadId || null,
          updated_at: now,
        })
        .eq("id", row.id);

      await admin
        .from("master_leads")
        .update({
          last_contacted_at: now,
          current_status: "Fresh Outreach",
          updated_at: now,
        })
        .eq("id", lead.id);

      const { data: acct } = await admin
        .from("outbound_email_accounts")
        .select("total_sent")
        .eq("id", row.sender_account_id)
        .single();

      await admin
        .from("outbound_email_accounts")
        .update({
          last_sent_at: now,
          total_sent: Number(acct?.total_sent || 0) + 1,
        })
        .eq("id", row.sender_account_id);

      await admin.from("mail_merge_events").insert({
        campaign_recipient_id: row.id,
        campaign_id: campaignId,
        lead_id: lead.id,
        sender_account_id: row.sender_account_id,
        actor_id: profile.id,
        event_type: "sent",
        details: {
          provider_message_id: providerId,
          provider_thread_id: providerThreadId || null,
          threaded_reply: Boolean(sameSubject),
        },
      });

      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Provider dispatch failed";

      await admin
        .from("mail_merge_campaign_recipients")
        .update({
          status: "Failed",
          failed_at: new Date().toISOString(),
          error_message: msg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      await admin.from("mail_merge_events").insert({
        campaign_recipient_id: row.id,
        campaign_id: campaignId,
        lead_id: lead.id,
        sender_account_id: row.sender_account_id,
        actor_id: profile.id,
        event_type: "send_failed",
        details: { error: msg },
      });

      failed++;
    }
  }

  const remaining =
    (
      await admin
        .from("mail_merge_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "Queued")
    ).count || 0;

  if (!remaining) {
    await admin
      .from("mail_merge_campaigns")
      .update({ status: failed ? "Paused" : "Completed", updated_at: new Date().toISOString() })
      .eq("id", campaignId);
  }

  return NextResponse.json({ sent, failed, suppressed, remaining });
}
