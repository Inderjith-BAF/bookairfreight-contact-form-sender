-- BookAirfreight Outbound OS foundation.
-- Historical activity keeps its original activity_date; imported_at is separate.

create table if not exists public.outbound_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'member' check (role in ('admin','manager','member')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.outbound_email_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  employee_id uuid references public.outbound_profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.outbound_sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stage text not null,
  subject_template text not null default '',
  content_template text not null default '',
  content_link text not null default '',
  content_creator text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.outbound_activities (
  id uuid primary key default gen_random_uuid(),
  activity_date date not null,
  employee_id uuid references public.outbound_profiles(id) on delete set null,
  email_account_id uuid references public.outbound_email_accounts(id) on delete set null,
  prospect_email text not null,
  company text not null default '',
  industry text not null default '',
  region text not null default '',
  lead_source text not null default '',
  campaign text not null default '',
  sequence_id uuid references public.outbound_sequences(id) on delete set null,
  stage text not null default '',
  subject text not null default '',
  content text not null default '',
  content_link text not null default '',
  content_creator text not null default '',
  outreach_volume integer not null default 0,
  open_count integer not null default 0,
  open_rate numeric(7,4) not null default 0,
  positive_replies integer not null default 0,
  neutral_replies integer not null default 0,
  negative_replies integer not null default 0,
  unsubscribes integer not null default 0,
  bounced integer not null default 0,
  auto_responses integer not null default 0,
  clicks integer not null default 0,
  bounce_rate numeric(7,4) not null default 0,
  qualified_leads integer not null default 0,
  follow_ups integer not null default 0,
  freshness text not null default 'fresh' check (freshness in ('fresh','recycled')),
  channel text not null default 'cold_email' check (channel in ('cold_email','contact_form')),
  source_file text,
  source_sheet text,
  source_row integer,
  imported_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists outbound_activities_date_idx on public.outbound_activities(activity_date);
create index if not exists outbound_activities_employee_idx on public.outbound_activities(employee_id);
create index if not exists outbound_activities_account_idx on public.outbound_activities(email_account_id);
create index if not exists outbound_activities_channel_idx on public.outbound_activities(channel);
create index if not exists outbound_activities_sequence_idx on public.outbound_activities(sequence_id);

alter table public.outbound_profiles enable row level security;
alter table public.outbound_email_accounts enable row level security;
alter table public.outbound_sequences enable row level security;
alter table public.outbound_activities enable row level security;

create or replace function public.outbound_is_admin_or_manager()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.outbound_profiles where id = auth.uid() and active and role in ('admin','manager')); $$;

create policy "outbound profiles self or leadership read" on public.outbound_profiles
for select to authenticated using (id = auth.uid() or public.outbound_is_admin_or_manager());

create policy "outbound email accounts scoped" on public.outbound_email_accounts
for select to authenticated using (employee_id = auth.uid() or public.outbound_is_admin_or_manager());

create policy "outbound sequences read" on public.outbound_sequences
for select to authenticated using (true);

create policy "outbound activities own or leadership read" on public.outbound_activities
for select to authenticated using (employee_id = auth.uid() or public.outbound_is_admin_or_manager());

create policy "outbound activities own insert" on public.outbound_activities
for insert to authenticated with check (employee_id = auth.uid() or public.outbound_is_admin_or_manager());

create policy "outbound activities own update" on public.outbound_activities
for update to authenticated using (employee_id = auth.uid() or public.outbound_is_admin_or_manager())
with check (employee_id = auth.uid() or public.outbound_is_admin_or_manager());

create policy "outbound activities leadership delete" on public.outbound_activities
for delete to authenticated using (public.outbound_is_admin_or_manager());

grant select on public.outbound_profiles, public.outbound_email_accounts, public.outbound_sequences, public.outbound_activities to authenticated;
grant insert, update, delete on public.outbound_activities to authenticated;
grant all on public.outbound_profiles, public.outbound_email_accounts, public.outbound_sequences, public.outbound_activities to service_role;
