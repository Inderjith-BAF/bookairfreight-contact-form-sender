-- Admin-managed tab visibility for Outbound OS profiles.
alter table public.outbound_profiles
  add column if not exists tab_permissions jsonb not null default '{"intelligence":true,"command":true,"daily":true,"weekly":true,"monthly":true,"my":true,"forms":true}'::jsonb;
