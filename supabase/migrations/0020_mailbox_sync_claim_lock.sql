-- Atomically prevent overlapping mailbox sync jobs from racing provider cursors.
create or replace function public.claim_mailbox_sync(p_account_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  claimed uuid;
begin
  update public.outbound_email_accounts
  set mailbox_sync_started_at = now(),
      mailbox_sync_error = null
  where id = p_account_id
    and active = true
    and connection_status = 'Connected'
    and (
      mailbox_sync_started_at is null
      or mailbox_sync_started_at < now() - interval '10 minutes'
    )
  returning id into claimed;
  return claimed is not null;
end;
$$;

grant execute on function public.claim_mailbox_sync(uuid) to service_role;
