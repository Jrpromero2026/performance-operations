import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import type { MembershipGrant } from "@/lib/authz/authz";
import type { RoleKey } from "@/lib/authz/permissions";
import { WORKSPACE_COOKIE } from "@/lib/workspace/constants";
import { PERIOD_COOKIE } from "@/lib/period/server";
import { IntelligenceSession } from "@/lib/intelligence/service";
import { formatMetricValue } from "@/lib/intelligence/format";

const REPORT_METRICS = [
  "appointments_completed",
  "completed_rate_bp",
  "cancellation_rate_bp",
  "no_show_rate_bp",
  "coaching_minutes",
  "schedule_utilization_bp",
  "revenue_listed_cents",
  "revenue_per_session_cents",
  "revenue_per_hour_cents",
  "payroll_gross_cents",
  "payroll_pct_of_revenue_bp",
  "active_clients",
  "new_clients",
  "client_retention_rate_bp",
];

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Report CSV export — serializes engine MetricResults verbatim (raw value +
 * formatted value + health + version). Records an export_events row.
 */
export async function GET() {
  const actor = await getActorContext();
  if (!actor) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const cookieStore = await cookies();
  const organizationId = cookieStore.get(WORKSPACE_COOKIE)?.value ?? "";
  const memberships: MembershipGrant[] = actor.memberships;
  const validOrg = memberships.some(
    (m) => m.organizationId === organizationId || m.roleKey === ("platform_admin" as RoleKey),
  );
  if (!organizationId || !validOrg) {
    return NextResponse.json({ error: "no_workspace_selected" }, { status: 400 });
  }
  if (!hasPermissionInOrganization(memberships, organizationId, "appointment:read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const periodId = cookieStore.get(PERIOD_COOKIE)?.value ?? "";
  const { data: period } = await actor.supabase
    .from("reporting_periods")
    .select("id, label, start_date, end_date, organization_id")
    .eq("id", periodId)
    .maybeSingle();
  if (!period || period.organization_id !== organizationId) {
    return NextResponse.json({ error: "no_period_selected" }, { status: 400 });
  }

  const session = await IntelligenceSession.create(
    actor,
    organizationId,
    period.start_date,
    period.end_date,
  );
  const results = session.getMetrics(REPORT_METRICS);

  const lines = [
    ["Performance Operations — Metric Report"].map(csvCell).join(","),
    ["Period", period.label, `${period.start_date} – ${period.end_date}`].map(csvCell).join(","),
    ["Engine", "intel-v1"].map(csvCell).join(","),
    "",
    ["Metric", "Value (raw)", "Value (formatted)", "Unit", "Health", "Notes"].map(csvCell).join(","),
    ...results.map((r) =>
      [
        r.metricId,
        r.value,
        formatMetricValue(r.value, r.unit),
        r.unit,
        r.health,
        r.reasons[0] ?? r.warnings[0] ?? "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ];

  await actor.supabase.from("export_events").insert({
    organization_id: organizationId,
    export_type: "metric_report",
    source_page: "reports",
    format: "csv",
    engine_version: "intel-v1",
    metadata: { period_id: period.id, metric_count: results.length },
    generated_by: actor.userId,
  });

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="metric-report-${period.start_date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
