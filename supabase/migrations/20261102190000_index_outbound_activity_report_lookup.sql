-- Speeds up the existing-row lookup used when adding campaign reports to My Outbound.
-- The API filters by these equality fields for each account/subject report group.
-- Large message content is intentionally excluded from the index and remains a residual
-- equality check, keeping the index compact while narrowing the candidate rows substantially.
create index if not exists outbound_activities_campaign_report_lookup_idx
  on public.outbound_activities (
    channel,
    region,
    company,
    email_account_text,
    activity_date,
    subject,
    stage
  );
