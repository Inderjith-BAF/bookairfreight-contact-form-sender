alter table public.mail_merge_campaign_recipients
  add column if not exists send_not_before timestamptz;

create index if not exists mmcr_send_not_before_idx
  on public.mail_merge_campaign_recipients(campaign_id, status, send_not_before);
