-- The UI now records Previous Campaign (PC) directly on each response count.
-- Keep one compact note field for attribution and remove the earlier row-level
-- attribution columns that are no longer needed.
alter table public.outbound_activities
  drop column if exists response_origin,
  drop column if exists response_sequence_id;
