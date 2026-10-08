-- Real mailbox connections for Mail Merge.
alter table public.outbound_email_accounts
  add column if not exists provider text,
  add column if not exists provider_account_id text,
  add column if not exists connection_status text not null default 'Disconnected',
  add column if not exists connection_error text,
  add column if not exists refresh_token_encrypted text,
  add column if not exists access_token_encrypted text,
  add column if not exists access_token_expires_at timestamptz,
  add column if not exists last_verified_at timestamptz;
alter table public.outbound_email_accounts
  drop constraint if exists outbound_email_accounts_provider_check;
alter table public.outbound_email_accounts
  add constraint outbound_email_accounts_provider_check check (provider is null or provider in ('google','microsoft'));
alter table public.outbound_email_accounts
  drop constraint if exists outbound_email_accounts_connection_status_check;
alter table public.outbound_email_accounts
  add constraint outbound_email_accounts_connection_status_check check (connection_status in ('Disconnected','Connecting','Connected','Error'));
create unique index if not exists outbound_email_accounts_provider_account_uidx
  on public.outbound_email_accounts(provider,provider_account_id)
  where provider is not null and provider_account_id is not null;
