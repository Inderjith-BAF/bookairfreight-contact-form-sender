import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireOutboundUser(request);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const unreadOnly = new URL(request.url).searchParams.get("unread") !== "false";
  let query = admin
    .from("mail_merge_notifications")
    .select("*")
    .eq("recipient_profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(25);
  if (unreadOnly) query = query.is("read_at", null);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data || [] });
}

export async function PATCH(request: Request) {
  const auth = await requireOutboundUser(request);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;
  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.map((id: unknown) => String(id)).filter(Boolean) : [];
  if (!ids.length) return NextResponse.json({ error: "Notification IDs are required." }, { status: 400 });
  const { error } = await admin
    .from("mail_merge_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_profile_id", profile.id)
    .in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: ids.length });
}
