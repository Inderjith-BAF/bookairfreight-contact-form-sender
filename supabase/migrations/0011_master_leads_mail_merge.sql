-- Mail Merge and Master Lead Sheet foundation (additive; existing outbound tables remain untouched).
alter table public.outbound_profiles drop constraint if exists outbound_profiles_role_check;
alter table public.outbound_profiles add constraint outbound_profiles_role_check
  check (role in ('admin','manager','member','lead_generation_admin'));

create table if not exists public.master_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text generated always as (lower(btrim(email))) stored,
  location_on_site text not null default '',
  country text not null default '',
  company_name text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  title text not null default '',
  main_product_description text not null default '',
  secondary_product_description text not null default '',
  main_industry text not null default '',
  main_additional_tag text not null default '',
  secondary_industry text not null default '',
  secondary_additional_tag text not null default '',
  qualified_lead text not null default '',
  assigned_to text not null default '',
  assigned_date text not null default '',
  ecommerce_platform_used text not null default '',
  data_from_lead_generation_team text not null default '',
  data_source text not null default '',
  email_finding_assigned_to text not null default '',
  email_finding_assigned_date text not null default '',
  business_personal_email text not null default '',
  fresh_outreach_assigned_to text not null default '',
  fresh_outreach_assigned_date text not null default '',
  lead_owner uuid references public.outbound_profiles(id) on delete set null,
  current_status text not null default 'New'
    check (current_status in ('New','Qualified','Fresh Outreach','Follow-up 1','Follow-up 2','Follow-up 3','Positive','Neutral','Negative','Out of Office','Bounced','Unsubscribed','Needs Review','Suppressed')),
  response_classification text
    check (response_classification is null or response_classification in ('Positive','Neutral','Negative')),
  suppression_reason text,
  suppressed_at timestamptz,
  last_contacted_at timestamptz,
  last_replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint master_leads_normalized_email_unique unique (normalized_email)
);
create index if not exists master_leads_country_idx on public.master_leads(country);
create index if not exists master_leads_company_idx on public.master_leads(company_name);
create index if not exists master_leads_owner_idx on public.master_leads(lead_owner);
create index if not exists master_leads_status_idx on public.master_leads(current_status);

create table if not exists public.lead_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null default 'Pasted data',
  imported_by uuid references public.outbound_profiles(id) on delete set null,
  total_rows integer not null default 0,
  added_count integer not null default 0,
  skipped_existing integer not null default 0,
  skipped_in_batch integer not null default 0,
  skipped_invalid integer not null default 0,
  skipped_missing_country integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.lead_import_results (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.lead_import_batches(id) on delete cascade,
  row_number integer not null,
  email text not null default '',
  company_name text not null default '',
  result text not null check (result in ('added','skipped')),
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists lead_import_results_batch_idx on public.lead_import_results(batch_id,row_number);

create table if not exists public.lead_activity_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.master_leads(id) on delete set null,
  actor_id uuid references public.outbound_profiles(id) on delete set null,
  event_type text not null,
  previous_value text,
  new_value text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lead_activity_events_lead_idx on public.lead_activity_events(lead_id,created_at desc);

create table if not exists public.mail_merge_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  campaign_group text not null check (campaign_group in ('Fresh Outreach','Follow-up 1','Follow-up 2','Follow-up 3','Custom')),
  subject text not null default '',
  body text not null default '',
  status text not null default 'Draft' check (status in ('Draft','Ready','Queued','Paused','Completed','Cancelled')),
  created_by uuid references public.outbound_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.master_leads enable row level security;
alter table public.lead_import_batches enable row level security;
alter table public.lead_import_results enable row level security;
alter table public.lead_activity_events enable row level security;
alter table public.mail_merge_campaigns enable row level security;

-- Access is mediated through authenticated Next.js API routes using the service role
-- after requireOutboundUser authorization; browser clients receive no direct table grants.
revoke all on public.master_leads, public.lead_import_batches, public.lead_import_results,
  public.lead_activity_events, public.mail_merge_campaigns from anon, authenticated;
grant all on public.master_leads, public.lead_import_batches, public.lead_import_results,
  public.lead_activity_events, public.mail_merge_campaigns to service_role;
