import { NextResponse } from "next/server";
import { requireOutboundUser } from "@/lib/outbound-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string) {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export async function GET(request: Request) {
  const auth = await requireOutboundUser(request);
  if ("error" in auth) return auth.error;

  const { admin, profile } = auth;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const scope = searchParams.get("scope") === "team" ? "team" : "mine";

  if ((from && !isValidDate(from)) || (to && !isValidDate(to)) || (from && to && from > to)) {
    return NextResponse.json({ error: "Provide a valid report date range." }, { status: 400 });
  }

  // Members can explicitly request team-wide reporting; otherwise their RPC
  // call is constrained to their own employee_id. Non-member scope semantics
  // match the existing report screen.
  const employeeId = profile.role === "member" && scope !== "team" ? profile.id : null;
  const [reportResult, teamResult] = await Promise.all([
    admin.rpc("get_outbound_report", {
      p_from: from || null,
      p_to: to || null,
      p_employee_id: employeeId,
    }),
    profile.role === "member" && scope !== "team"
      ? Promise.resolve({ data: [profile], error: null })
      : admin.from("outbound_profiles").select("id,full_name,role,active").eq("active", true).order("full_name"),
  ]);

  if (reportResult.error) {
    console.error("[outbound/reports] aggregation failed:", reportResult.error);
    return NextResponse.json({ error: "Unable to calculate outbound report." }, { status: 500 });
  }
  if (teamResult.error) {
    console.error("[outbound/reports] team lookup failed:", teamResult.error);
    return NextResponse.json({ error: "Unable to load report team." }, { status: 500 });
  }

  return NextResponse.json({
    profile,
    report: reportResult.data || {},
    team: teamResult.data || [],
    scope,
    from: from || null,
    to: to || null,
  });
}
