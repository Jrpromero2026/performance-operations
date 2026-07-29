import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { MetricCard } from "@/components/widgets/metric-card";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { getPeriodContext } from "@/lib/period/server";
import { IntelligenceSession } from "@/lib/intelligence/service";
import { QuickReport } from "./quick-report";
import { SaveCurrentReportForm, SavedViewRowActions } from "./saved-view-forms";

export const metadata: Metadata = { title: "Reports" };

/**
 * Report Center: quick report (engine-driven), saved views, and export
 * history. Everything calls the IntelligenceSession — no business logic.
 * Scheduled reports remain an intentional placeholder (no scheduler
 * infrastructure exists).
 */

const TABS = [
  ["quick", "Quick report"],
  ["saved", "Saved views"],
  ["exports", "Export history"],
] as const;

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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab = TABS.some(([key]) => key === rawTab) ? rawTab! : "quick";
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
          title="Report Center"
          description="Operational reports from the Performance Intelligence Engine."
        />
        <EmptyState
          title="Select a reporting period"
          description="Choose a reporting period in the header — every report is computed for that window."
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

  /* ------------------------------ full report center ------------------ */
  const canExport = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "payroll:export",
  );

  const { data: savedViews } =
    tab === "saved"
      ? await actor.supabase
          .from("saved_views")
          .select("*")
          .eq("owner_id", actor.userId)
          .eq("page", "reports")
          .order("pinned", { ascending: false })
          .order("updated_at", { ascending: false })
      : { data: null };

  const { data: exportEvents } =
    tab === "exports"
      ? await actor.supabase
          .from("export_events")
          .select("*, profiles:generated_by ( full_name, email )")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: null };

  const { data: payrollExports } =
    tab === "exports" && canExport
      ? await actor.supabase
          .from("payroll_exports")
          .select("id, export_type, snapshot_version, superseded, created_at, payroll_runs ( id, name )")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: null };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report Center"
        description={headerDescription}
        actions={
          <a
            href="/reports/export"
            className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            Download report CSV
          </a>
        }
      />

      <div className="flex gap-1.5" data-testid="report-tabs">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/reports?tab=${key}`}
            className={`h-8 rounded-[--radius-control] border px-3 text-sm leading-8 ${
              tab === key
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface text-ink hover:bg-surface-sunken"
            }`}
          >
            {label}
          </Link>
        ))}
        <span className="ml-2 self-center text-xs text-ink-muted">
          Scheduled reports: planned (no scheduler yet)
        </span>
      </div>

      {tab === "quick" && (
        <QuickReport
          session={session}
          memberships={context.memberships}
          organizationId={organizationId}
        />
      )}

      {tab === "saved" && (
        <div className="space-y-4" data-testid="report-saved-views">
          <SaveCurrentReportForm
            page="reports"
            config={{
              reportingPeriodId: period.selected.id,
              periodLabel: period.selected.label,
              organizationId,
            }}
          />
          {(savedViews ?? []).length === 0 ? (
            <EmptyState
              title="No saved views yet"
              description="Save the current report with a name to find it here; pin your favorites."
            />
          ) : (
            <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface shadow-sm">
              {(savedViews ?? []).map((view) => {
                const config = view.config as { periodLabel?: string };
                return (
                  <li key={view.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">
                        {view.pinned && (
                          <span className="text-[10px] font-bold uppercase text-accent">pinned</span>
                        )}
                        <Link href="/reports" className="truncate hover:text-accent">
                          {view.name}
                        </Link>
                      </p>
                      <p className="text-xs text-ink-muted">
                        {config.periodLabel ?? "—"} · saved {view.updated_at.slice(0, 10)}
                      </p>
                    </div>
                    <SavedViewRowActions id={view.id} pinned={view.pinned} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "exports" && (
        <div className="space-y-6" data-testid="report-exports">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">Report exports</h2>
            {(exportEvents ?? []).length === 0 ? (
              <p className="text-sm text-ink-muted">No report exports recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface shadow-sm">
                {(exportEvents ?? []).map((event) => {
                  const profile = event.profiles as unknown as {
                    full_name: string | null;
                    email: string;
                  } | null;
                  return (
                    <li key={event.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-ink">
                        {event.export_type}
                        <span className="ml-2 text-xs text-ink-muted">
                          {event.format.toUpperCase()} · {event.engine_version ?? ""}
                        </span>
                      </span>
                      <span className="text-xs text-ink-muted">
                        {profile?.full_name || profile?.email || "—"} ·{" "}
                        {event.created_at.slice(0, 16).replace("T", " ")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {canExport && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-ink">Payroll exports</h2>
              {(payrollExports ?? []).length === 0 ? (
                <p className="text-sm text-ink-muted">No payroll exports recorded yet.</p>
              ) : (
                <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface shadow-sm">
                  {(payrollExports ?? []).map((event) => {
                    const run = event.payroll_runs as unknown as {
                      id: string;
                      name: string;
                    } | null;
                    return (
                      <li key={event.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="text-ink">
                          {event.export_type.replaceAll("_", " ")}
                          {run && (
                            <Link
                              href={`/payroll/${run.id}/statements`}
                              className="ml-2 text-xs font-medium text-accent hover:text-accent-strong"
                            >
                              {run.name}
                            </Link>
                          )}
                          {event.superseded && (
                            <span className="ml-2 text-[10px] font-bold uppercase text-warning">
                              superseded
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-ink-muted">
                          {event.snapshot_version ? `v${event.snapshot_version} · ` : ""}
                          {event.created_at.slice(0, 16).replace("T", " ")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
          <p className="text-xs text-ink-muted">
            CSV is the supported format (Excel opens CSV directly; PDF comes
            from the browser print view on statements). Every export records
            actor, time, format, and engine version.
          </p>
        </div>
      )}
    </div>
  );
}
