-- Research memory for the Freight Intelligence engine.
create table if not exists public.outbound_intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  mode text not null default 'deep-research',
  source_count integer not null default 0,
  changed_source_count integer not null default 0,
  failed_source_count integer not null default 0,
  result jsonb not null default '{}'::jsonb
);

create index if not exists outbound_intelligence_runs_generated_at_idx
  on public.outbound_intelligence_runs(generated_at desc);

create table if not exists public.outbound_intelligence_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  source_name text not null,
  url text not null,
  checked_at timestamptz not null default now(),
  ok boolean not null default false,
  status integer,
  content_hash text,
  chars integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists outbound_intelligence_source_snapshots_source_idx
  on public.outbound_intelligence_source_snapshots(source_id, checked_at desc);

alter table public.outbound_intelligence_runs enable row level security;
alter table public.outbound_intelligence_source_snapshots enable row level security;

-- The API uses the Supabase service-role client after authenticating the
-- Outbound OS user. No direct client policy is required for these tables.
