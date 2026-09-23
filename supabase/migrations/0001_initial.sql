create table if not exists public.submission_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sender_name text not null,
  company text,
  email text not null,
  phone text,
  subject text,
  message text not null,
  total_targets integer not null default 0,
  status text not null default 'queued'
);

create table if not exists public.submission_targets (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.submission_batches(id) on delete cascade,
  created_at timestamptz not null default now(),
  url text not null,
  status text not null default 'queued',
  message text,
  detected_fields text[] default '{}',
  submitted_at timestamptz
);

alter table public.submission_batches enable row level security;
alter table public.submission_targets enable row level security;
