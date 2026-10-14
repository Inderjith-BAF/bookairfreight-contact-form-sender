-- Expand account-level pacing to the eight requested intervals and allow every account
-- to dispatch independently, even when multiple accounts belong to the same employee.
alter table public.mail_merge_account_dispatchers
  add column if not exists last_interval_seconds integer not null default 60;

alter table public.mail_merge_account_dispatchers
  drop constraint if exists mail_merge_account_dispatchers_last_interval_seconds_check;

alter table public.mail_merge_account_dispatchers
  add constraint mail_merge_account_dispatchers_last_interval_seconds_check
  check (last_interval_seconds in (30, 60, 90, 120, 150, 180, 210, 240));

create or replace function public.claim_mail_merge_account_recipient(p_account_id uuid)
returns table(id uuid, campaign_id uuid, lead_id uuid, sender_account_id uuid, batch_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_send_at timestamptz;
  v_candidate uuid;
  v_batch uuid;
  v_interval_seconds integer;
begin
  if p_account_id is null then return; end if;

  insert into public.mail_merge_account_dispatchers(account_id, next_send_at, updated_at)
  values (p_account_id, now(), now()) on conflict (account_id) do nothing;

  -- Lock only this account's dispatcher row so other accounts remain independent.
  select d.next_send_at into v_next_send_at
    from public.mail_merge_account_dispatchers d
    where d.account_id = p_account_id for update;
  if v_next_send_at > now() then return; end if;

  select r.id, coalesce(r.batch_id, r.id)
    into v_candidate, v_batch
    from public.mail_merge_campaign_recipients r
    where r.sender_account_id = p_account_id
      and r.status = 'Queued'
      and coalesce(r.send_not_before, now()) <= now()
    order by r.created_at, r.id
    limit 1 for update skip locked;

  if v_candidate is null then return; end if;

  -- Select one of the eight approved pacing intervals independently for each
  -- account claim. This timer applies only to this account.
  v_interval_seconds := (array[30, 60, 90, 120, 150, 180, 210, 240])[1 + floor(random() * 8)::integer];

  update public.mail_merge_campaign_recipients
    set status = 'Sending', updated_at = now()
    where public.mail_merge_campaign_recipients.id = v_candidate;

  update public.mail_merge_account_dispatchers
    set next_send_at = now() + make_interval(secs => v_interval_seconds),
        last_interval_seconds = v_interval_seconds,
        updated_at = now()
    where account_id = p_account_id;

  return query
    select r.id, r.campaign_id, r.lead_id, r.sender_account_id, r.batch_id
    from public.mail_merge_campaign_recipients r
    where r.id = v_candidate;
end;
$$;

revoke execute on function public.claim_mail_merge_account_recipient(uuid) from public, anon, authenticated;
grant execute on function public.claim_mail_merge_account_recipient(uuid) to service_role;
