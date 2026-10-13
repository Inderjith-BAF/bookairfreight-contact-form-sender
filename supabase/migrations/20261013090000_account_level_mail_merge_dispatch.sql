-- Replace shared domain pacing with independent account pacing and member-level sequential batches.
create table if not exists public.mail_merge_account_dispatchers (
  account_id uuid primary key references public.outbound_email_accounts(id) on delete cascade,
  next_send_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mail_merge_account_dispatchers enable row level security;
revoke all on public.mail_merge_account_dispatchers from anon, authenticated;
grant all on public.mail_merge_account_dispatchers to service_role;

create index if not exists mmcr_dispatch_order_idx
  on public.mail_merge_campaign_recipients(sender_account_id, status, created_at);

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

  select a.employee_id into v_owner
    from public.outbound_email_accounts a where a.id = p_account_id;
  if not found then return; end if;

  insert into public.mail_merge_account_dispatchers(account_id, next_send_at, updated_at)
  values (p_account_id, now(), now()) on conflict (account_id) do nothing;

  select d.next_send_at into v_next_send_at
    from public.mail_merge_account_dispatchers d
    where d.account_id = p_account_id for update;
  if v_next_send_at > now() then return; end if;

  -- A member's oldest outstanding account/batch runs first. A later account
  -- cannot start until all recipients in that batch are terminal.
  if v_owner is not null then
    select batches.sender_account_id, batches.campaign_id, batches.batch_key
      into v_first_account, v_first_campaign, v_first_batch
      from (
        select r.sender_account_id, r.campaign_id,
               coalesce(r.batch_id, r.id) as batch_key,
               min(r.created_at) as first_created_at
          from public.mail_merge_campaign_recipients r
          join public.outbound_email_accounts a on a.id = r.sender_account_id
          where a.employee_id = v_owner and r.status in ('Queued','Sending')
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

  return query select r.id, r.campaign_id, r.lead_id, r.sender_account_id, r.batch_id
    from public.mail_merge_campaign_recipients r where r.id = v_candidate;
end;
$$;

revoke execute on function public.claim_mail_merge_account_recipient(uuid) from public, anon, authenticated;
grant execute on function public.claim_mail_merge_account_recipient(uuid) to service_role;
