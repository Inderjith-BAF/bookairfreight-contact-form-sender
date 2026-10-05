-- Mail Merge execution layer.
alter table public.outbound_email_accounts
  add column if not exists daily_send_limit integer not null default 100,
  add column if not exists hourly_send_limit integer not null default 20,
  add column if not exists health_status text not null default 'Healthy'
    check (health_status in ('Healthy','Watch','Paused')),
  add column if not exists last_sent_at timestamptz,
  add column if not exists total_sent integer not null default 0;
create table if not exists public.mail_merge_campaign_recipients (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.mail_merge_campaigns(id) on delete cascade,
  lead_id uuid not null references public.master_leads(id) on delete cascade,
  sender_account_id uuid references public.outbound_email_accounts(id) on delete set null,
  subject text not null default '', body text not null default '',
  status text not null default 'Ready' check (status in ('Ready','Queued','Sending','Sent','Failed','Skipped','Suppressed','Bounced','Replied')),
  queued_at timestamptz, sent_at timestamptz, failed_at timestamptz, error_message text, provider_message_id text,
  open_count integer not null default 0, click_count integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(campaign_id, lead_id)
);
create index if not exists mmcr_campaign_idx on public.mail_merge_campaign_recipients(campaign_id,status);
create index if not exists mmcr_sender_idx on public.mail_merge_campaign_recipients(sender_account_id,status);
create index if not exists mmcr_lead_idx on public.mail_merge_campaign_recipients(lead_id);
create table if not exists public.mail_merge_events (
  id uuid primary key default gen_random_uuid(), campaign_recipient_id uuid references public.mail_merge_campaign_recipients(id) on delete set null,
  campaign_id uuid references public.mail_merge_campaigns(id) on delete set null, lead_id uuid references public.master_leads(id) on delete set null,
  sender_account_id uuid references public.outbound_email_accounts(id) on delete set null, actor_id uuid references public.outbound_profiles(id) on delete set null,
  event_type text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists mme_campaign_idx on public.mail_merge_events(campaign_id,created_at desc);
create index if not exists mme_lead_idx on public.mail_merge_events(lead_id,created_at desc);
create table if not exists public.mail_merge_audit_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.outbound_profiles(id) on delete set null,
  action text not null, entity_type text not null, entity_id uuid, before_value jsonb, after_value jsonb, created_at timestamptz not null default now()
);
alter table public.mail_merge_campaign_recipients enable row level security;
alter table public.mail_merge_events enable row level security;
alter table public.mail_merge_audit_log enable row level security;
revoke all on public.mail_merge_campaign_recipients, public.mail_merge_events, public.mail_merge_audit_log from anon, authenticated;
grant all on public.mail_merge_campaign_recipients, public.mail_merge_events, public.mail_merge_audit_log to service_role;
grant all on public.outbound_email_accounts to service_role;
