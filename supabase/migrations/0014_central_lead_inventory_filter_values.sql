create or replace function public.central_lead_inventory_filter_values(
  p_field text,
  p_q text default '',
  p_source text default '',
  p_column_filters jsonb default '{}'::jsonb,
  p_excel_filters jsonb default '{}'::jsonb,
  p_limit integer default 1000
)
returns table(value text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  allowed_fields text[] := array[
    'location_on_site','country','company_name','first_name','last_name','title','email',
    'main_product_description','secondary_product_description','main_industry','main_additional_tag',
    'secondary_industry','secondary_additional_tag','qualified_lead','assigned_to','assigned_date',
    'ecommerce_platform_used','data_from_lead_generation_team','data_source','email_finding_assigned_to',
    'email_finding_assigned_date','business_personal_email','contact_form','fresh_outreach_assigned_to',
    'fresh_outreach_assigned_date'
  ];
  f text;
  v text;
  vals text[];
  where_sql text := ' where true';
  search_columns text := 'location_on_site,country,company_name,first_name,last_name,title,email,main_product_description,secondary_product_description,main_industry,main_additional_tag,secondary_industry,secondary_additional_tag,qualified_lead,assigned_to,ecommerce_platform_used,data_from_lead_generation_team,data_source,email_finding_assigned_to,business_personal_email,contact_form,fresh_outreach_assigned_to';
  pattern text;
begin
  if not (p_field = any(allowed_fields)) then
    raise exception 'Unsupported filter field';
  end if;

  if coalesce(p_source,'') <> '' then
    where_sql := where_sql || format(' and data_source ilike %L', '%' || replace(replace(p_source,'%',''), '_','') || '%');
  end if;

  if coalesce(p_q,'') <> '' then
    pattern := '%' || replace(replace(replace(replace(p_q, '%',''), '_',''), ',',' '), ')',' ') || '%';
    where_sql := where_sql || ' and (' || (
      select string_agg(format('%I::text ilike %L', trim(col), pattern), ' or ')
      from unnest(string_to_array(search_columns, ',')) col
    ) || ')';
  end if;

  for f, v in select key, value from jsonb_each_text(coalesce(p_column_filters,'{}'::jsonb))
  loop
    if f = p_field or not (f = any(allowed_fields)) or coalesce(v,'') = '' then continue; end if;
    if f like '%_date' then
      where_sql := where_sql || format(' and %I::text = %L', f, v);
    else
      where_sql := where_sql || format(' and %I::text ilike %L', f, '%' || replace(replace(v,'%',''), '_','') || '%');
    end if;
  end loop;

  for f in select key from jsonb_each(coalesce(p_excel_filters,'{}'::jsonb))
  loop
    if f = p_field or not (f = any(allowed_fields)) then continue; end if;
    select array_agg(x) into vals
    from jsonb_array_elements_text(coalesce(p_excel_filters -> f, '[]'::jsonb)) as t(x);
    if vals is null or cardinality(vals) = 0 then continue; end if;
    if '' = any(vals) then
      where_sql := where_sql || format(' and (%I is null or %I::text = %L', f, f, '');
      vals := array_remove(vals, '');
      if cardinality(vals) > 0 then
        where_sql := where_sql || format(' or %I::text = any(%L::text[])', f, vals);
      end if;
      where_sql := where_sql || ')';
    else
      where_sql := where_sql || format(' and %I::text = any(%L::text[])', f, vals);
    end if;
  end loop;

  return query execute format(
    'select distinct coalesce(%I::text, '''') as value from public.central_lead_inventory %s order by 1 limit %s',
    p_field, where_sql, greatest(1, least(coalesce(p_limit,1000), 2000))
  );
end;
$$;

revoke all on function public.central_lead_inventory_filter_values(text,text,text,jsonb,jsonb,integer) from public, anon;
grant execute on function public.central_lead_inventory_filter_values(text,text,text,jsonb,jsonb,integer) to authenticated, service_role;
