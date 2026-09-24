import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await requireOutboundUser(request, ["admin", "manager"]);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null);
  const { name, stage, subject_template = "", content_template = "", content_link = "", content_creator = "" } = body ?? {};
  if (!name || !stage) return NextResponse.json({ error: "Sequence name and stage are required." }, { status: 400 });
  const { data, error } = await auth.admin.from("outbound_sequences").insert({ name, stage, subject_template, content_template, content_link, content_creator }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sequence: data });
}
