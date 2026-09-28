-- Ensure the service-role API client can write the intelligence memory tables.
-- RLS remains enabled; the service role is the application writer.
grant select, insert, update, delete on table public.outbound_intelligence_runs to service_role;
grant select, insert, update, delete on table public.outbound_intelligence_source_snapshots to service_role;
