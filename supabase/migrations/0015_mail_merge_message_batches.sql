-- Mail Merge message batches
-- A campaign may use multiple 10-recipient message batches from the same sending account.
-- Each batch has its own subject/content and is independently capped at 10 recipients.
alter table public.mail_merge_campaign_recipients
  add column if not exists batch_id uuid;

create index if not exists mmcr_campaign_batch_idx
  on public.mail_merge_campaign_recipients(campaign_id, sender_account_id, batch_id, status);
