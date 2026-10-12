-- Add the spreadsheet's Contact form field to the shared inventory.
-- Existing leads receive an empty value, and blank contact forms remain valid.
alter table public.central_lead_inventory
  add column if not exists contact_form text not null default '';

-- Refresh PostgREST's schema cache so API inserts/selects can see the new column.
notify pgrst, 'reload schema';
