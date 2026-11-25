-- Durable provider-native mailbox sync cursors.
-- Cursors are advanced only after a complete provider delta page sequence is processed.
alter table public.outbound_email_accounts
  add column if not exists gmail_history_id text,
  add column if not exists graph_inbox_delta_link text,
  add column if not exists graph_junk_delta_link text,
  add column if not exists mailbox_sync_started_at timestamptz,
  add column if not exists mailbox_last_synced_at timestamptz,
  add column if not exists mailbox_sync_error text;

create index if not exists outbound_email_accounts_mailbox_sync_idx
  on public.outbound_email_accounts(connection_status, mailbox_sync_started_at)
  where active = true;
