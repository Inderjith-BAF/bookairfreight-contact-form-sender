-- Store response classifications on the specific campaign recipient, not only on the global lead.
ALTER TABLE public.mail_merge_campaign_recipients
  ADD COLUMN IF NOT EXISTS response_classification text
  CHECK (response_classification IS NULL OR response_classification IN ('Positive', 'Neutral', 'Negative'));

-- Backfill existing classifications onto only the most recent campaign recipient
-- with a confirmed human reply. This avoids duplicating one lead-level label
-- across original and follow-up campaigns.
WITH ranked_replies AS (
  SELECT
    r.id AS recipient_id,
    r.lead_id,
    ROW_NUMBER() OVER (
      PARTITION BY r.lead_id
      ORDER BY r.sent_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id
    ) AS reply_rank
  FROM public.mail_merge_campaign_recipients r
  WHERE r.status = 'Replied'
)
UPDATE public.mail_merge_campaign_recipients r
SET response_classification = l.response_classification
FROM ranked_replies rr
JOIN public.master_leads l ON l.id = rr.lead_id
WHERE r.id = rr.recipient_id
  AND rr.reply_rank = 1
  AND l.response_classification IN ('Positive', 'Neutral', 'Negative');
