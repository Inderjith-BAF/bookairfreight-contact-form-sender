-- Mail Merge response classification
-- The Master Lead Sheet status workflow records classification on the
-- campaign recipient that received the reply as well as on master_leads.
alter table public.mail_merge_campaign_recipients
  add column if not exists response_classification text
    check (response_classification is null or response_classification in ('Positive','Neutral','Negative'));

create index if not exists mmcr_response_classification_idx
  on public.mail_merge_campaign_recipients(response_classification);
