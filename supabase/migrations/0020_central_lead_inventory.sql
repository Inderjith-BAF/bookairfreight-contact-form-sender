-- Separate inventory workspace. Deliberately independent from public.master_leads.
create table if not exists public.central_lead_inventory (
  id uuid primary key default gen_random_uuid(),
  location_on_site text not null default '',
  country text not null default '',
  company_name text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  title text not null default '',
  email text not null,
  normalized_email text generated always as (lower(btrim(email))) stored,
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
  imported_by uuid references public.outbound_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint central_lead_inventory_email_unique unique (normalized_email)
);
create index if not exists central_lead_inventory_country_idx on public.central_lead_inventory(country);
create index if not exists central_lead_inventory_source_idx on public.central_lead_inventory(data_source);
create index if not exists central_lead_inventory_fresh_owner_idx on public.central_lead_inventory(fresh_outreach_assigned_to);
alter table public.central_lead_inventory enable row level security;
revoke all on public.central_lead_inventory from anon, authenticated;
grant all on public.central_lead_inventory to service_role;