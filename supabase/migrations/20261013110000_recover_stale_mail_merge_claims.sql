-- Prevent abandoned claims from freezing every account owned by an employee.
-- A provider send can outlive the request, so never automatically requeue stale
-- Sending rows (that could duplicate an email). Mark them Failed for verification.
create index if not exists mmcr_stale_sending_idx
  on public.mail_merge_campaign_recipients(status, updated_at)
  where status = 'Sending';

update public.mail_merge_campaign_recipients
   set status = 'Failed',
       failed_at = coalesce(failed_at, now()),
       error_message = coalesce(
         nullif(error_message, ''),
         'Stale Sending claim expired after 10 minutes. Verify provider delivery before retrying.'
       ),
       updated_at = now()
 where status = 'Sending'
   and updated_at < now() - interval '10 minutes';

create or replace function public.claim_mail_merge_account_recipient(p_account_id uuid)
returns table(id uuid, campaign_id uuid, lead_id uuid, sender_account_id uuid, batch_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_send_at timestamptz;
  v_owner uuid;
  v_candidate uuid;
  v_batch uuid;
  v_first_account uuid;
  v_first_campaign uuid;
  v_first_batch uuid;
begin
  if p_account_id is null then return; end if;

  -- Recover stale claims on every worker tick. The previous domain-level
  -- dispatcher could leave a recipient in Sending forever, which would make
  -- the employee-wide oldest-batch rule block every other account.
  -- Mark Failed rather than auto-requeueing: provider delivery may have
  -- succeeded even if the application failed before recording it.
  update public.mail_merge_campaign_recipients
     set status = 'Failed',
         failed_at = coalesce(failed_at, now()),
         error_message = coalesce(
           nullif(error_message, ''),
           'Stale Sending claim expired after 10 minutes. Verify provider delivery before retrying.'
         ),
         updated_at = now()
   where status = 'Sending'
     and updated_at < now() - interval '10 minutes';

  select a.employee_id into v_owner
    from public.outbound_email_accounts a where a.id = p_account_id;
  if not found then return; end if;

  insert into public.mail_merge_account_dispatchers(account_id, next_send_at, updated_at)
  values (p_account_id, now(), now()) on conflict (account_id) do nothing;

  select d.next_send_at into v_next_send_at
    from public.mail_merge_account_dispatchers d
    where d.account_id = p_account_id for update;
  if v_next_send_at > now() then return; end if;

  -- Only the oldest outstanding batch for this employee may run.
  -- Other employees remain independent and can dispatch concurrently.
  if v_owner is not null then
    select batches.sender_account_id, batches.campaign_id, batches.batch_key
      into v_first_account, v_first_campaign, v_first_batch
      from (
        select r.sender_account_id, r.campaign_id,
               coalesce(r.batch_id, r.id) as batch_key,
               min(r.created_at) as first_created_at,
               min(r.id::text) as first_id
          from public.mail_merge_campaign_recipients r
          join public.outbound_email_accounts a on a.id = r.sender_account_id
          where a.employee_id = v_owner
            and r.status in ('Queued', 'Sending')
          group by r.sender_account_id, r.campaign_id, coalesce(r.batch_id, r.id)
          order by min(r.created_at), min(r.id::text)
          limit 1
      ) batches;
    if v_first_account is not null and v_first_account <> p_account_id then return; end if;
  end if;

  select r.id, coalesce(r.batch_id, r.id)
    into v_candidate, v_batch
    from public.mail_merge_campaign_recipients r
    where r.sender_account_id = p_account_id
      and r.status = 'Queued'
      and coalesce(r.send_not_before, now()) <= now()
      and (v_first_account is null or (
        r.sender_account_id = v_first_account
        and r.campaign_id = v_first_campaign
        and coalesce(r.batch_id, r.id) = v_first_batch
      ))
    order by r.created_at, r.id
    limit 1 for update skip locked;

  if v_candidate is null then return; end if;

  update public.mail_merge_campaign_recipients
    set status = 'Sending', updated_at = now()
    where public.mail_merge_campaign_recipients.id = v_candidate;

  update public.mail_merge_account_dispatchers
    set next_send_at = now() + make_interval(secs => 60 + floor(random() * 61)::integer),
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
