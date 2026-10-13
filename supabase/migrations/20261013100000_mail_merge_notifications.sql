create table if not exists public.mail_merge_notifications (id uuid primary key default gen_random_uuid(), recipient_profile_id uuid not null, account_id uuid, notification_type text not null default 'account', title text not null, message text not null, read_at timestamptz, created_at timestamptz not null default now());
alter table public.mail_merge_notifications enable row level security;
grant all on public.mail_merge_notifications to service_role;

notify pgrst, 'reload schema';
