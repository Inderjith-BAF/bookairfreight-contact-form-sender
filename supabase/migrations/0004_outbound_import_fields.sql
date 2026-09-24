alter table public.outbound_activities
  add column if not exists employee_name text not null default '',
  add column if not exists email_account_text text not null default '',
  add column if not exists import_batch_id uuid;
create index if not exists outbound_activities_import_idx on public.outbound_activities(import_batch_id);
