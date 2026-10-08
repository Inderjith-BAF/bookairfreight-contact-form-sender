-- Domain-level Mail Merge dispatcher state, employee notifications, and atomic slot reservation.
create table if not exists public.mail_merge_domain_dispatchers (
  domain text primary key,
  next_send_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mail_merge_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.outbound_profiles(id) on delete cascade,
  notification_type text not null,
  account_id uuid references public.outbound_email_accounts(id) on delete cascade,
  campaign_id uuid references public.mail_merge_campaigns(id) on delete set null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mm_notifications_recipient_idx
  on public.mail_merge_notifications(recipient_profile_id, read_at, created_at desc);

create unique index if not exists mm_notifications_unread_account_idx
  on public.mail_merge_notifications(recipient_profile_id, account_id, notification_type)
  where read_at is null and account_id is not null;

alter table public.mail_merge_domain_dispatchers enable row level security;
alter table public.mail_merge_notifications enable row level security;

drop policy if exists "mail merge notifications own read" on public.mail_merge_notifications;
create policy "mail merge notifications own read"
  on public.mail_merge_notifications
  for select
  to authenticated
  using (recipient_profile_id = auth.uid());

drop policy if exists "mail merge notifications own update" on public.mail_merge_notifications;
create policy "mail merge notifications own update"
  on public.mail_merge_notifications
  for update
  to authenticated
  using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());

create or replace function public.reserve_mail_merge_domain_slots(
  p_domain text,
  p_count integer
)
returns table(slot_index integer, send_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := lower(trim(p_domain));
  v_next timestamptz;
  v_slot timestamptz;
  v_gap integer;
  i integer;
begin
  if v_domain = '' or p_count is null or p_count < 1 then
    return;
  end if;

  insert into public.mail_merge_domain_dispatchers(domain, next_send_at, updated_at)
  values (v_domain, now(), now())
  on conflict (domain) do nothing;

  select d.next_send_at
    into v_next
    from public.mail_merge_domain_dispatchers d
    where d.domain = v_domain
    for update;

  v_slot := greatest(v_next, now());

  for i in 0..p_count - 1 loop
    if i = 0 then
      send_at := v_slot;
    else
      v_gap := 30 + floor(random() * 31)::integer;
      v_slot := v_slot + make_interval(secs => v_gap);
      send_at := v_slot;
    end if;
    slot_index := i;
    return next;
  end loop;

  update public.mail_merge_domain_dispatchers
    set next_send_at = v_slot + make_interval(secs => 1),
        updated_at = now()
    where domain = v_domain;
end;
$$;

revoke execute on function public.reserve_mail_merge_domain_slots(text, integer) from public, anon, authenticated;
grant execute on function public.reserve_mail_merge_domain_slots(text, integer) to service_role;

create or replace function public.claim_mail_merge_recipient(p_domain text)
returns table(
  id uuid,
  campaign_id uuid,
  lead_id uuid,
  sender_account_id uuid,
  batch_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select r.id
    into v_id
    from public.mail_merge_campaign_recipients r
    join public.outbound_email_accounts a on a.id = r.sender_account_id
    where r.status = 'Queued'
      and r.send_not_before <= now()
      and lower(split_part(a.email, '@', 2)) = lower(trim(p_domain))
    order by r.send_not_before asc, random()
    limit 1
    for update skip locked;

  if v_id is null then
    return;
  end if;

  update public.mail_merge_campaign_recipients
    set status = 'Sending',
        updated_at = now()
    where public.mail_merge_campaign_recipients.id = v_id;

  return query
    select r.id, r.campaign_id, r.lead_id, r.sender_account_id, r.batch_id
    from public.mail_merge_campaign_recipients r
    where r.id = v_id;
end;
$$;

revoke execute on function public.claim_mail_merge_recipient(text) from public, anon, authenticated;
grant execute on function public.claim_mail_merge_recipient(text) to service_role;
