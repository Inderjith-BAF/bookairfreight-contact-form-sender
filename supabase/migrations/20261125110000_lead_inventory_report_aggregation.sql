-- Aggregate Central Lead Inventory reporting inside Postgres.
-- Return grouped dimensions only; the API normalizes country labels without
-- transferring every lead row to the application server.
create or replace function public.get_lead_inventory_report()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      created_at,
      nullif(btrim(fresh_outreach_assigned_to), '') as assigned_to,
      coalesce(business_personal_email, '') as email_type,
      coalesce(nullif(btrim(data_from_lead_generation_team), ''), 'Not specified') as source_name,
      coalesce(nullif(btrim(data_source), ''), 'Not specified') as raw_sheet,
      coalesce(nullif(btrim(country), ''), 'Not specified') as country_name,
      coalesce(nullif(btrim(main_industry), ''), 'Not specified') as industry_name
    from public.central_lead_inventory
  ),
  last_days as (
    select (current_date - day_offset)::date as day
    from generate_series(6, 0, -1) as days(day_offset)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'assigned', (select count(*) from base where assigned_to is not null),
    'business', (select count(*) from base where email_type ~* 'business'),
    'personal', (select count(*) from base where email_type ~* 'personal'),
    'addedToday', (select count(*) from base where created_at::date = current_date),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('key', source_name, 'count', n) order by n desc) from (select source_name, count(*) n from base group by source_name) x), '[]'::jsonb),
    'rawSheets', coalesce((select jsonb_agg(jsonb_build_object('key', raw_sheet, 'count', n) order by n desc) from (select raw_sheet, count(*) n from base group by raw_sheet) x), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('key', country_name, 'count', n) order by n desc) from (select country_name, count(*) n from base group by country_name) x), '[]'::jsonb),
    'industries', coalesce((select jsonb_agg(jsonb_build_object('key', industry_name, 'count', n) order by n desc) from (select industry_name, count(*) n from base group by industry_name) x), '[]'::jsonb),
    'last7', (select jsonb_agg(jsonb_build_object('key', to_char(d.day, 'YYYY-MM-DD'), 'count', coalesce(c.n, 0)) order by d.day) from last_days d left join (select created_at::date day, count(*) n from base where created_at >= current_date - 6 group by created_at::date) c on c.day = d.day)
  );
$$;

grant execute on function public.get_lead_inventory_report() to service_role;
