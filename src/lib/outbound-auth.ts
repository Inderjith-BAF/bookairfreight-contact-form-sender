import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { OutboundProfile, Role } from "@/lib/outbound-types";

export async function requireOutboundUser(request: Request, roles?: Role[]) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const admin = getSupabaseAdmin();
  if (!token || !admin) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }) };
  const { data: profile, error } = await admin.from("outbound_profiles").select("*").eq("id", userData.user.id).maybeSingle();
  if (error || !profile || !profile.active) return { error: NextResponse.json({ error: "Your outbound account is not provisioned." }, { status: 403 }) };
  if (roles && !roles.includes(profile.role)) return { error: NextResponse.json({ error: "You do not have permission for this action." }, { status: 403 }) };
  return { admin, user: userData.user, profile: profile as OutboundProfile };
}

export function publicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase public configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}
