-- Server-side Outbound Reports aggregation.
-- Additive only: no existing activity rows or report definitions are changed.
create or replace function public.outbound_report_safe_num(p_value text)
returns numeric
language plpgsql
immutable
as $$
begin
  return coalesce(nullif(btrim(p_value), '')::numeric, 0);
exception when others then
  return 0;
end;
$$;

create or replace function public.outbound_report_response_meta(p_note text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_note is null or btrim(p_note) = '' then
    return '{"positive":0,"neutral":0,"negative":0}'::jsonb;
  end if;
  return p_note::jsonb;
exception when others then
  return '{"positive":0,"neutral":0,"negative":0}'::jsonb;
end;
$$;

create or replace function public.get_outbound_report(
  p_from date default null,
  p_to date default null,
  p_employee_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with source as (
  select
    a.id, a.activity_date, a.employee_id, coalesce(nullif(btrim(a.employee_name), ''), 'Unassigned') as employee_name,
    coalesce(nullif(btrim(a.region), ''), 'Unspecified') as region,
    coalesce(nullif(btrim(a.lead_source), ''), 'Unspecified') as lead_source,
    coalesce(nullif(btrim(a.subject), ''), 'Unspecified') as subject,
    coalesce(nullif(btrim(a.campaign), ''), 'Unspecified') as campaign,
    coalesce(nullif(btrim(a.content_creator), ''), 'Unassigned') as content_creator,
    coalesce(nullif(btrim(a.content_link), ''), '') as content_link,
    a.sequence_id, a.stage,
    coalesce(nullif(a.prospect_email, ''), nullif(a.email_account_text, ''), '') as prospect_email,
    coalesce(a.channel, 'cold_email') as channel,
    greatest(0, coalesce(a.outreach_volume, 0)) as outreach,
    least(greatest(0, coalesce(a.outreach_volume, 0)),
      greatest(0, coalesce(nullif(a.open_count, 0),
        round(greatest(0, coalesce(a.outreach_volume, 0)) * least(100, greatest(0, coalesce(a.open_rate, 0))) / 100)::integer))) as opens,
    greatest(0, coalesce(a.positive_replies, 0)) as raw_positive,
    greatest(0, coalesce(a.neutral_replies, 0)) as raw_neutral,
    greatest(0, coalesce(a.negative_replies, 0)) as raw_negative,
    greatest(0, coalesce(a.bounced, 0)) as bounced,
    greatest(0, coalesce(a.unsubscribes, 0)) as unsubscribes,
    greatest(0, coalesce(a.clicks, 0)) as clicks,
    greatest(0, coalesce(a.qualified_leads, 0)) as leads,
    greatest(0, coalesce(a.follow_ups, 0)) as followups,
    public.outbound_report_response_meta(a.response_note) as pc
  from public.outbound_activities a
  where (p_from is null or a.activity_date >= p_from)
    and (p_to is null or a.activity_date <= p_to)
    and (p_employee_id is null or a.employee_id = p_employee_id)
), normalized as (
  select s.*,
    public.outbound_report_safe_num(pc->>'positive') as pc_positive,
    public.outbound_report_safe_num(pc->>'neutral') as pc_neutral,
    public.outbound_report_safe_num(pc->>'negative') as pc_negative
  from source s
), metrics as (
  select n.*,
    (pc_positive + pc_neutral + pc_negative) > 0 as has_pc,
    greatest(0, raw_positive - case when pc_positive+pc_neutral+pc_negative>0 then pc_positive else 0 end) as positive,
    greatest(0, raw_neutral - case when pc_positive+pc_neutral+pc_negative>0 then pc_neutral else 0 end) as neutral,
    greatest(0, raw_negative - case when pc_positive+pc_neutral+pc_negative>0 then pc_negative else 0 end) as negative
  from normalized n
), email as (select * from metrics where channel <> 'contact_form'),
forms as (select * from metrics where channel = 'contact_form'),
totals as (
  select
    coalesce(sum(outreach),0) as outreach, coalesce(sum(opens),0) as open,
    coalesce(sum(positive),0) as positive, coalesce(sum(neutral),0) as neutral, coalesce(sum(negative),0) as negative,
    coalesce(sum(bounced),0) as bounce, coalesce(sum(unsubscribes),0) as unsubscribe,
    coalesce(sum(clicks),0) as clicks, coalesce(sum(leads),0) as leads, coalesce(sum(followups),0) as followups,
    coalesce(sum(pc_positive),0) as previous_positive, coalesce(sum(pc_neutral),0) as previous_neutral,
    coalesce(sum(pc_negative),0) as previous_negative,
    count(distinct case when has_pc and prospect_email <> '' then prospect_email end) as pc_accounts
  from email
), form_totals as (
  select coalesce(sum(outreach),0) outreach, coalesce(sum(opens),0) as open,
    coalesce(sum(positive),0) positive, coalesce(sum(neutral),0) neutral, coalesce(sum(negative),0) negative,
    coalesce(sum(bounced),0) bounce, coalesce(sum(unsubscribes),0) unsubscribe,
    coalesce(sum(clicks),0) clicks, coalesce(sum(leads),0) leads, coalesce(sum(followups),0) followups,
    coalesce(sum(pc_positive),0) previous_positive, coalesce(sum(pc_neutral),0) previous_neutral,
    coalesce(sum(pc_negative),0) previous_negative,
    count(distinct case when has_pc and prospect_email <> '' then prospect_email end) pc_accounts
  from forms
), overall as (
  select coalesce(sum(outreach),0) outreach, coalesce(sum(positive),0) positive,
    coalesce(sum(neutral),0) neutral, coalesce(sum(negative),0) negative,
    coalesce(sum(pc_positive),0) previous_positive, coalesce(sum(pc_neutral),0) previous_neutral,
    coalesce(sum(pc_negative),0) previous_negative
  from metrics
), dimensions as (
  select 'region' dimension, region name, email.* from email
  union all select 'lead_source', lead_source, email.* from email
  union all select 'subject', subject, email.* from email
  union all select 'campaign', campaign, email.* from email
  union all select 'content_creator', content_creator, email.* from email
), grouped as (
  select dimension, name,
    sum(outreach) outreach, sum(opens) as open,
    sum(positive) pos, sum(neutral) neutral, sum(negative) negative,
    sum(bounced) bounce, sum(clicks) clicks, sum(leads) leads,
    sum(pc_positive) pc_positive, sum(pc_neutral) pc_neutral, sum(pc_negative) pc_negative,
    count(distinct case when has_pc and prospect_email <> '' then prospect_email end) pc_accounts
  from dimensions group by dimension, name
), member_groups as (
  select employee_id, coalesce(max(employee_name), 'Unassigned') employee_name, sum(outreach) outreach, sum(opens) open,
    sum(positive) positive, sum(neutral) neutral, sum(negative) negative,
    sum(pc_positive) previous_positive, sum(pc_neutral) previous_neutral, sum(pc_negative) previous_negative
  from email group by employee_id
), form_country as (
  select region country, sum(outreach) outreach, sum(raw_positive) positive,
    sum(raw_neutral) neutral, sum(raw_negative) negative
  from forms group by region
), form_member as (
  select employee_id, coalesce(max(employee_name), 'Unassigned') employee_name, sum(outreach) outreach, sum(positive) positive,
    sum(neutral) neutral, sum(negative) negative
  from forms group by employee_id
), country_campaign as (
  select region country, campaign, sum(outreach) outreach, sum(positive) positive,
    sum(neutral) neutral, sum(negative) negative
  from email group by region, campaign
), sequence_rank as (
  select id, row_number() over (order by created_at asc, id asc)::integer as sequence_number
  from public.outbound_sequences where active = true
), content_links as (
  select content_link as link, content_creator as creator, sequence_number as sequence, sum(positive) as positive
  from (
    select e.content_link, e.content_creator, e.positive,
      case
        when e.stage ~* 'draft[[:space:]]*[0-9]+' then least(200, greatest(1, substring(e.stage from 'draft[[:space:]]*([0-9]+)')::integer))
        when sr.sequence_number is not null then least(200, sr.sequence_number)
        else case e.stage
          when 'Email 1' then 1 when 'Fresh Outreach' then 1
          when 'Email 2' then 2 when 'Follow-Up 2' then 2
          when 'Follow-up 1' then 3 when 'Follow-Up 3' then 3
          when 'Follow-up 2' then 4 when 'Follow-Up 4' then 4
          when 'Follow-up 3' then 5 when 'Follow-Up 5' then 5
          else 1 end
      end as sequence_number
    from email e left join sequence_rank sr on sr.id = e.sequence_id
    where e.content_link <> '' and e.positive > 0
  ) link_rows
  group by content_link, content_creator, sequence_number
)
select jsonb_build_object(
  'email', (select to_jsonb(t) from totals t),
  'contact_form', (select to_jsonb(t) from form_totals t),
  'overall', (select to_jsonb(t) from overall t),
  'groups', coalesce((select jsonb_object_agg(dimension, rows) from (
    select dimension, jsonb_agg(jsonb_build_object(
      'name', name, 'outreach', outreach, 'open', open, 'pos', pos, 'neutral', neutral,
      'negative', negative, 'bounce', bounce, 'clicks', clicks, 'leads', leads,
      'pcPositive', pc_positive, 'pcNeutral', pc_neutral, 'pcNegative', pc_negative,
      'pcAccounts', pc_accounts
    ) order by outreach desc) rows from grouped group by dimension
  ) g), '{}'::jsonb),
  'members', coalesce((select jsonb_agg(jsonb_build_object(
    'employee_id', employee_id, 'employee_name', employee_name, 'outreach', outreach,
    'open', open, 'positive', positive+previous_positive, 'neutral', neutral+previous_neutral,
    'negative', negative+previous_negative, 'previousPositive', previous_positive,
    'previousNeutral', previous_neutral, 'previousNegative', previous_negative
  ) order by outreach desc) from member_groups), '[]'::jsonb),
  'contact_form_countries', coalesce((select jsonb_agg(to_jsonb(x) order by outreach desc) from form_country x), '[]'::jsonb),
  'contact_form_members', coalesce((select jsonb_agg(to_jsonb(x) order by outreach desc) from form_member x), '[]'::jsonb),
  'campaign_countries', coalesce((select jsonb_agg(to_jsonb(x) order by country, campaign) from country_campaign x where outreach>0 or positive+neutral+negative>0), '[]'::jsonb),
  'content_links', coalesce((select jsonb_agg(to_jsonb(x)) from content_links x), '[]'::jsonb)
);
$$;

grant execute on function public.get_outbound_report(date, date, uuid) to service_role;

revoke all on function public.get_outbound_report(date, date, uuid) from public, anon, authenticated;
grant execute on function public.get_outbound_report(date, date, uuid) to service_role;
revoke all on function public.outbound_report_safe_num(text) from public, anon, authenticated;
revoke all on function public.outbound_report_response_meta(text) from public, anon, authenticated;
grant execute on function public.outbound_report_safe_num(text) to service_role;
grant execute on function public.outbound_report_response_meta(text) to service_role;
