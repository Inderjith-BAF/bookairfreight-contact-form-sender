alter table public.outbound_activities
  add column if not exists response_origin text not null default 'current_outreach'
    check (response_origin in ('current_outreach','previous_outreach')),
  add column if not exists response_sequence_id uuid references public.outbound_sequences(id) on delete set null,
  add column if not exists response_note text not null default '';

create index if not exists outbound_activities_response_sequence_idx
  on public.outbound_activities(response_sequence_id);
