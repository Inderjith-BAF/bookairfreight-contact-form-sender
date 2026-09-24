alter table public.submission_targets
  add column if not exists evidence text[] not null default '{}';
