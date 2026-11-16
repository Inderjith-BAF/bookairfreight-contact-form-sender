-- Query indexes for high-volume Outbound OS paths.
-- All indexes are additive; no existing rows or business data are modified.

create index if not exists mmcr_account_status_created_idx
  on public.mail_merge_campaign_recipients(sender_account_id, status, created_at desc);

create index if not exists mmcr_campaign_status_created_idx
  on public.mail_merge_campaign_recipients(campaign_id, status, created_at desc);

create index if not exists mmcr_account_provider_message_idx
  on public.mail_merge_campaign_recipients(sender_account_id, provider_message_id)
  where provider_message_id is not null and provider_message_id <> '';

create index if not exists mmcr_account_provider_thread_idx
  on public.mail_merge_campaign_recipients(sender_account_id, provider_thread_id)
  where provider_thread_id is not null and provider_thread_id <> '';

create index if not exists mme_account_event_created_idx
  on public.mail_merge_events(sender_account_id, event_type, created_at desc);

create index if not exists mme_campaign_event_created_idx
  on public.mail_merge_events(campaign_id, event_type, created_at desc);

create index if not exists mme_recipient_event_idx
  on public.mail_merge_events(campaign_recipient_id, event_type)
  where campaign_recipient_id is not null;

create index if not exists central_lead_inventory_created_id_idx
  on public.central_lead_inventory(created_at desc, id);

create index if not exists central_lead_inventory_country_created_idx
  on public.central_lead_inventory(country, created_at desc);

create index if not exists central_lead_inventory_owner_created_idx
  on public.central_lead_inventory(fresh_outreach_assigned_to, created_at desc);

create index if not exists outbound_activities_date_channel_employee_idx
  on public.outbound_activities(activity_date desc, channel, employee_id);

create index if not exists outbound_activities_campaign_date_idx
  on public.outbound_activities(company, activity_date desc, email_account_text);

create index if not exists master_leads_status_contacted_idx
  on public.master_leads(current_status, last_contacted_at desc);

create index if not exists master_leads_last_replied_idx
  on public.master_leads(last_replied_at desc)
  where last_replied_at is not null;
