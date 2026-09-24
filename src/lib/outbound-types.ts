export type Role = "admin" | "manager" | "member";
export type ActivityChannel = "cold_email" | "contact_form";
export type Freshness = "fresh" | "recycled";
export type Sequence = {
  id: string; name: string; stage: string; subject_template: string;
  content_template: string; content_link: string; content_creator: string;
};
export type OutboundProfile = { id: string; full_name: string; role: Role; active: boolean };
export type OutboundActivity = {
  id?: string; activity_date: string; employee_id?: string | null; employee_name?: string;
  email_account_id?: string | null; email_account?: string; email_account_text?: string; prospect_email: string;
  company?: string; industry?: string; region?: string; lead_source?: string;
  campaign?: string; sequence_id?: string | null; sequence_name?: string; stage?: string;
  subject?: string; content?: string; content_link?: string; content_creator?: string;
  outreach_volume: number; open_count: number; open_rate: number; positive_replies: number;
  neutral_replies: number; negative_replies: number; unsubscribes: number; bounced: number;
  auto_responses: number; clicks: number; bounce_rate: number; qualified_leads: number;
  follow_ups: number; freshness?: Freshness; response_note?: string; channel: ActivityChannel; source_file?: string;
  source_sheet?: string; source_row?: number; imported_at?: string;
};
export type DashboardData = {
  profile: OutboundProfile; sequences: Sequence[]; activities: OutboundActivity[];
  team: OutboundProfile[];
};
