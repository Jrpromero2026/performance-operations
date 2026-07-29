import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { getPeriodContext } from "@/lib/period/server";
import { IntelligenceSession } from "@/lib/intelligence/service";
import {
  formatMetricValue,
  HEALTH_CLASS,
  HEALTH_LABEL,
} from "@/lib/intelligence/format";
import type { MetricBreakdown } from "@/lib/intelligence/shared/types";
import { MetricCard } from "@/components/widgets/metric-card";

export const metadata: Metadata = { title: "Reports" };

/**
 * The reporting surface. Every number on this page comes from the
 * Performance Intelligence Engine (IntelligenceSession) — the page holds
 * ZERO formulas; it only requests metrics and formats units for display.
 */

const OVERVIEW_CARDS: [string, string][] = [
  ["appointments_completed", "Sessions completed"],
  ["completed_rate_bp", "Completed rate"],
  ["cancellation_rate_bp", "Cancellation rate"],
  ["no_show_rate_bp", "No-show rate"],
  ["coaching_minutes", "Coaching time"],
  ["schedule_utilization_bp", "Schedule utilization"],
];

const REVENUE_CARDS: [string, string][] = [
  ["revenue_listed_cents", "Revenue (listed)"],
  ["revenue_per_session_cents", "Revenue / session"],
  ["revenue_per_hour_cents", "Revenue / hour"],
  ["revenue_growth_bp", "Revenue growth"],
];

const PAYROLL_CARDS: [string, string][] = [
  ["payroll_gross_cents", "Gross payroll"],
  ["payroll_pct_of_revenue_bp", "Payroll %"],
  ["payroll_per_hour_cents", "Payroll / hour"],
  ["payroll_variance_cents", "Payroll variance"],
];

const CLIENT_CARDS: [string, string][] = [
  ["active_clients", "Active clients"],
  ["new_clients", "New clients"],
  ["returning_clients", "Returning clients"],
  ["client_retention_rate_bp", "Client retention"],
];

const SELF_CARDS: [string, string][] = [
  ["appointments_completed", "Sessions completed"],
  ["appointments_cancelled", "Cancelled"],
  ["appointments_no_show", "No-shows"],
  ["completed_rate_bp", "Completed rate"],
  ["coaching_minutes", "Coaching time"],
  ["average_session_duration_minutes", "Avg session duration"],
  ["revenue_listed_cents", "Revenue (listed)"],
  ["revenue_per_hour_cents", "Revenue / hour"],
  ["payroll_gross_cents", "Gross payroll (posted)"],
  ["payroll_per_hour_cents", "Payroll / hour"],
  ["active_clients", "Active clients"],
  ["repeat_client_count", "Repeat clients"],
  ["schedule_utilization_bp", "Schedule utilization"],
];

const READINESS_ROWS: string[] = [
  "trainer_assignment_coverage_bp",
  "compensation_coverage_bp",
  "service_alias_coverage_bp",
  "reporting_period_coverage_bp",
  "import_health_bp",
  "payroll_readiness_bp",
  "organization_readiness_bp",
];

function BreakdownTable({
  title,
  testId,
  firstColumn,
  breakdowns,
}: {
  title: string;
  testId: string;
  firstColumn: string;
  breakdowns: { label: string; breakdown: MetricBreakdown }[];
}) {
  const keys = new Map<string, string>();
  for (const { breakdown } of breakdowns) {
    for (const row of breakdown.rows) keys.set(row.key, row.label);
  }
  const sorted = [...keys.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <section className="space-y-2" data-testid={testId}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-ink-muted">No data in this reporting period.</p>
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">{firstColumn}</th>
                {breakdowns.map((b) => (
                  <th key={b.label} className="px-4 py-2 text-right font-medium">
                    {b.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(([key, label]) => (
                <tr key={key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{label}</td>
                  {breakdowns.map((b) => {
                    const row = b.breakdown.rows.find((r) => r.key === key);
                    return (
                      <td key={b.label} className="px-4 py-2.5 text-right font-mono text-xs">
                        {row
                          ? formatMetricValue(row.value, b.breakdown.unit)
                          : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function ReportsPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Reports" />;
  if (context.selection.kind !== "organization") {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Select a single workspace first." />
        <EmptyState
          title="Choose a workspace"
          description="Reports are computed per organization by the Performance Intelligence Engine."
        />
      </div>
    );
  }
  const organizationId = context.selection.organizationId;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Reports" />;

  const canOrgRead = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "appointment:read",
  );
  const canSelfRead = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "trainer:read_self",
  );
  if (!canOrgRead && !canSelfRead) return <PermissionDenied title="Reports" />;

  const period = await getPeriodContext(context);
  if (!period.selected) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Reports"
          description="Operational metrics from the Performance Intelligence Engine."
        />
        <EmptyState
          title="Select a reporting period"
          description="Choose a reporting period in the header — every metric is computed for that window (with previous-period comparisons)."
        />
      </div>
    );
  }

  const session = await IntelligenceSession.create(
    actor,
    organizationId,
    period.selected.startDate,
    period.selected.endDate,
  );

  const headerDescription = `${context.selected?.name ?? ""} · ${period.selected.label} (${period.selected.startDate} – ${period.selected.endDate}) · engine intel-v1`;

  /* ------------------------------ trainer self-service view ----------- */
  if (!canOrgRead) {
    const results = SELF_CARDS.map(([id, label]) => ({
      label,
      result: session.getMetric(id),
    }));
    return (
      <div className="space-y-6">
        <PageHeader title="My performance" description={headerDescription} />
        <section
          className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
          data-testid="report-self"
        >
          {results.map(({ label, result }) => (
            <MetricCard key={result.metricId} result={result} label={label} />
          ))}
        </section>
        <p className="text-xs text-ink-muted">
          Metrics cover your own sessions only. Payroll figures appear once a
          payroll run is posted.
        </p>
      </div>
    );
  }

  /* ------------------------------ full report ------------------------- */
  const canManageReports = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "report:manage",
  );

  const cardSection = (
    testId: string,
    title: string,
    cards: [string, string][],
  ) => (
    <section className="space-y-2" data-testid={testId}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([id, label]) => (
          <MetricCard key={id} result={session.getMetric(id)} label={label} />
        ))}
      </div>
    </section>
  );

  const departmentBreakdowns = [
    { label: "Sessions", breakdown: session.getBreakdown("appointments_completed", "department") },
    { label: "Coaching time", breakdown: session.getBreakdown("coaching_minutes", "department") },
    { label: "Revenue (listed)", breakdown: session.getBreakdown("revenue_listed_cents", "department") },
    { label: "Avg session value", breakdown: session.getBreakdown("average_session_value_cents", "department") },
    { label: "Active trainers", breakdown: session.getBreakdown("active_trainers", "department") },
    { label: "Active clients", breakdown: session.getBreakdown("active_clients", "department") },
  ];
  const trainerBreakdowns = [
    { label: "Sessions", breakdown: session.getBreakdown("appointments_completed", "trainer") },
    { label: "Coaching time", breakdown: session.getBreakdown("coaching_minutes", "trainer") },
    { label: "Revenue (listed)", breakdown: session.getBreakdown("revenue_listed_cents", "trainer") },
    { label: "Revenue / hour", breakdown: session.getBreakdown("revenue_per_hour_cents", "trainer") },
    { label: "Gross payroll", breakdown: session.getBreakdown("payroll_gross_cents", "trainer") },
  ];

  const summary = canManageReports ? session.getExecutiveSummary() : null;
  const readiness = canManageReports
    ? READINESS_ROWS.map((id) => session.getMetric(id))
    : [];

  return (
    <div className="space-y-8">
      <PageHeader title="Reports" description={headerDescription} />

      {cardSection("report-org-metrics", "Appointments & utilization", OVERVIEW_CARDS)}
      {cardSection("report-revenue", "Revenue", REVENUE_CARDS)}
      {cardSection("report-payroll", "Payroll", PAYROLL_CARDS)}
      {cardSection("report-clients", "Clients & retention", CLIENT_CARDS)}

      <BreakdownTable
        title="Departments"
        testId="report-departments"
        firstColumn="Department"
        breakdowns={departmentBreakdowns}
      />
      <BreakdownTable
        title="Trainers"
        testId="report-trainers"
        firstColumn="Trainer"
        breakdowns={trainerBreakdowns}
      />

      {canManageReports && (
        <section className="space-y-2" data-testid="report-readiness">
          <h2 className="text-sm font-semibold text-ink">Configuration readiness</h2>
          <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[560px] text-sm">
              <tbody>
                {readiness.map((result) => (
                  <tr
                    key={result.metricId}
                    className="border-b border-border last:border-0"
                    data-metric={result.metricId}
                    data-health={result.health}
                  >
                    <td className="px-4 py-2.5 text-ink">
                      {/* label from the catalog via metadata-free lookup */}
                      {result.metricId
                        .replaceAll("_bp", "")
                        .replaceAll("_", " ")
                        .replace(/^./, (c) => c.toUpperCase())}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatMetricValue(result.value, result.unit)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${HEALTH_CLASS[result.health]}`}
                      >
                        {HEALTH_LABEL[result.health]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">
                      {result.reasons[0] ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {summary?.allowed && (
        <section className="space-y-2" data-testid="report-summary">
          <h2 className="text-sm font-semibold text-ink">Executive summary</h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {summary.items.map((item) => (
              <li
                key={item.code}
                className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm"
                data-summary={item.code}
              >
                <p className="text-xs uppercase tracking-wide text-ink-muted">
                  {item.headline}
                </p>
                {item.subject ? (
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {item.subject}
                    <span className="ml-2 font-mono text-xs text-ink-secondary">
                      {formatMetricValue(item.value, item.unit)}
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-ink-muted">{item.detail}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-ink-muted">
        All figures are computed by the Performance Intelligence Engine
        (intel-v1) from the canonical appointment ledger, finalized payroll
        runs, and configuration — the same definitions every export and future
        dashboard uses. Revenue is source listed/paid value; payroll uses
        posted runs only.
      </p>
    </div>
  );
}
