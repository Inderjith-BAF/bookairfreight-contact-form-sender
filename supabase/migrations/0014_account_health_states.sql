-- Expand account health states to the blueprint's Healthy / Watch / Paused / Restricted model.
alter table public.outbound_email_accounts drop constraint if exists outbound_email_accounts_health_status_check;
alter table public.outbound_email_accounts add constraint outbound_email_accounts_health_status_check check (health_status in ('Healthy','Watch','Paused','Restricted'));