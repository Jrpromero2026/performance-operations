/**
 * The analytics query service — the ONE entry point every analytics
 * surface (scorecards, dashboards, cohorts, presentation, exports) uses.
 *
 * Composition, not calculation: the service resolves windows, creates AT
 * MOST ONE IntelligenceSession per loaded span, memoizes every metric
 * request (identical requests never hit the engine twice), and derives
 * presentation-only comparisons. All metric values, health states, and
 * versions pass through from the engine verbatim; RLS plus the engine's
 * permission scoping remain the authorities underneath.
 */

import type { ActorContext } from "@/lib/actions/shared";
import { actorCan } from "@/lib/actions/shared";
import { IntelligenceSession } from "@/lib/intelligence/service";
import type { ScopeInput, FilterInput } from "@/lib/intelligence/service";
import { METRIC_DEFINITIONS } from "@/lib/intelligence/catalog";
import type {
  MetricBreakdown,
  MetricResult,
} from "@/lib/intelligence/shared/types";
import type { IntelligenceDataset } from "@/lib/intelligence/shared/facts";
import type { BreakdownGroup } from "@/lib/intelligence/shared/breakdowns";
import { buildMetricComparison } from "../comparisons/compare";
import {
  localToday,
  resolveComparisonWindow,
  resolveRollingPeriods,
  windowFromPeriod,
  type PeriodFacts,
  type WindowResolution,
} from "../comparisons/windows";
import { getMetricAnalyticsMetadata } from "../shared/metadata";
import type {
  AnalyticsWindow,
  BreakdownComparison,
  ComparisonWindowKind,
  MetricComparison,
  MetricSeries,
} from "../shared/types";

/** Windows the service will evaluate in one request (defensive cap). */
const MAX_WINDOWS_PER_REQUEST = 26;

function scopeKey(scope: ScopeInput): string {
  return [
    scope.departmentId ?? "",
    scope.trainerId ?? "",
    scope.serviceId ?? "",
    scope.clientId ?? "",
  ].join("|");
}

export class AnalyticsService {
  private session: IntelligenceSession | null = null;
  private sessionSpan: { from: string; to: string } | null = null;
  private readonly metricCache = new Map<string, MetricResult>();
  private readonly breakdownCache = new Map<string, MetricBreakdown>();
  /** Diagnostic: how many engine evaluations were served from cache. */
  cacheHits = 0;

  private constructor(
    private readonly actor: ActorContext,
    readonly organizationId: string,
    readonly periods: readonly PeriodFacts[],
    readonly today: string,
  ) {}

  /**
   * Create the service for an organization. Loads the reporting-period
   * list ONCE (window resolution + finality labels); refuses callers
   * without the analytics entry permission — individual metric access is
   * additionally narrowed by the engine per metric.
   */
  static async create(
    actor: ActorContext,
    organizationId: string,
    options: { today?: string } = {},
  ): Promise<AnalyticsService | { denied: string }> {
    if (!actorCan(actor, organizationId, "analytics:read")) {
      return { denied: "You do not have permission to use analytics." };
    }
    const { data } = await actor.supabase
      .from("reporting_periods")
      .select("id, label, start_date, end_date, status")
      .eq("organization_id", organizationId)
      .order("start_date", { ascending: false })
      .limit(60);
    const periods: PeriodFacts[] = (data ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      startDate: p.start_date,
      endDate: p.end_date,
      status: p.status,
    }));
    return new AnalyticsService(
      actor,
      organizationId,
      periods,
      options.today ?? localToday(),
    );
  }

  /* ------------------------------------------------------------ windows */

  /** The window for a reporting period id, or null when unknown. */
  periodWindow(reportingPeriodId: string): AnalyticsWindow | null {
    const period = this.periods.find((p) => p.id === reportingPeriodId);
    return period ? windowFromPeriod(period, "current", this.today) : null;
  }

  /** An explicit custom window (never a close artifact). */
  customWindow(dateFrom: string, dateTo: string, label?: string): AnalyticsWindow {
    return {
      kind: "current",
      label: label ?? `${dateFrom} – ${dateTo}`,
      dateFrom,
      dateTo,
      reportingPeriodId: null,
      finality: "not_final",
      partial: dateTo >= this.today,
    };
  }

  resolveComparison(
    kind: ComparisonWindowKind,
    anchor: AnalyticsWindow,
    custom?: { dateFrom: string; dateTo: string; label?: string },
  ): WindowResolution {
    return resolveComparisonWindow(kind, anchor, this.periods, this.today, custom);
  }

  rollingPeriods(anchor: AnalyticsWindow, count: number) {
    return resolveRollingPeriods(anchor, this.periods, count, this.today);
  }

  /* ------------------------------------------------------------ session */

  /**
   * One engine session per loaded span. A request needing dates outside
   * the current span creates ONE wider session covering the union — the
   * batched fact load every downstream evaluation shares.
   */
  private async sessionFor(windows: readonly AnalyticsWindow[]): Promise<IntelligenceSession> {
    if (windows.length === 0) throw new Error("analytics_no_windows");
    if (windows.length > MAX_WINDOWS_PER_REQUEST) {
      throw new Error("analytics_too_many_windows");
    }
    let from = windows[0].dateFrom;
    let to = windows[0].dateTo;
    for (const w of windows) {
      if (w.dateFrom < from) from = w.dateFrom;
      if (w.dateTo > to) to = w.dateTo;
    }
    if (this.session && this.sessionSpan) {
      if (this.sessionSpan.from <= from && this.sessionSpan.to >= to) {
        return this.session;
      }
      from = from < this.sessionSpan.from ? from : this.sessionSpan.from;
      to = to > this.sessionSpan.to ? to : this.sessionSpan.to;
    }
    this.session = await IntelligenceSession.create(
      this.actor,
      this.organizationId,
      from,
      to,
    );
    this.sessionSpan = { from, to };
    // A wider dataset invalidates nothing (results are window-exact), so
    // the memo caches survive session widening.
    return this.session;
  }

  /** Memoized engine request — identical requests never evaluate twice. */
  private async metricFor(
    metricId: string,
    window: AnalyticsWindow,
    scope: ScopeInput,
    filters: FilterInput = {},
  ): Promise<MetricResult> {
    const key = `${metricId}|${scopeKey(scope)}|${window.dateFrom}|${window.dateTo}|${filters.serviceId ?? ""}|${filters.compensationMethod ?? ""}`;
    const cached = this.metricCache.get(key);
    if (cached) {
      this.cacheHits++;
      return cached;
    }
    const session = await this.sessionFor([window]);
    const result = session.getMetricForWindow(
      metricId,
      { dateFrom: window.dateFrom, dateTo: window.dateTo },
      scope,
      filters,
    );
    this.metricCache.set(key, result);
    return result;
  }

  /* ------------------------------------------------------------ queries */

  /** One metric across an ordered list of windows (multi-period series). */
  async getMetricSeries(
    metricId: string,
    windows: readonly AnalyticsWindow[],
    scope: ScopeInput = {},
  ): Promise<MetricSeries> {
    const session = await this.sessionFor(windows); // batch load first
    void session;
    const definition = METRIC_DEFINITIONS.get(metricId);
    const metadata = getMetricAnalyticsMetadata(metricId);
    const points = [];
    for (const window of windows) {
      const result = await this.metricFor(metricId, window, scope);
      points.push({
        window,
        value: result.value,
        health: result.health,
        reason: result.reasons[0] ?? null,
      });
    }
    return {
      metricId,
      metricName: definition?.name ?? metricId,
      unit: definition?.unit ?? "count",
      metricVersion: definition?.version ?? "unknown",
      direction: metadata?.direction ?? "neutral",
      points,
    };
  }

  /** One metric, anchor window versus one comparison window. */
  async getMetricComparison(
    metricId: string,
    anchor: AnalyticsWindow,
    comparisonKind: ComparisonWindowKind,
    scope: ScopeInput = {},
    custom?: { dateFrom: string; dateTo: string; label?: string },
  ): Promise<MetricComparison> {
    const resolution = this.resolveComparison(comparisonKind, anchor, custom);
    const current = await this.metricFor(metricId, anchor, scope);
    if (!resolution.ok) {
      return buildMetricComparison({
        current,
        currentWindow: anchor,
        comparison: null,
        comparisonWindow: null,
        missingReason: resolution.reason,
      });
    }
    // Load both windows in one span before evaluating.
    await this.sessionFor([anchor, resolution.window]);
    const comparison = await this.metricFor(metricId, resolution.window, scope);
    return buildMetricComparison({
      current,
      currentWindow: anchor,
      comparison,
      comparisonWindow: resolution.window,
    });
  }

  /** Many metrics × many comparison kinds, batched over one session. */
  async getMultiPeriodComparison(
    metricIds: readonly string[],
    anchor: AnalyticsWindow,
    comparisonKinds: readonly ComparisonWindowKind[],
    scope: ScopeInput = {},
  ): Promise<Record<string, MetricComparison[]>> {
    const resolved = comparisonKinds.map((kind) => ({
      kind,
      resolution: this.resolveComparison(kind, anchor),
    }));
    const windows = [
      anchor,
      ...resolved.flatMap((r) => (r.resolution.ok ? [r.resolution.window] : [])),
    ];
    await this.sessionFor(windows);
    const out: Record<string, MetricComparison[]> = {};
    for (const metricId of metricIds) {
      const current = await this.metricFor(metricId, anchor, scope);
      out[metricId] = [];
      for (const { resolution } of resolved) {
        if (!resolution.ok) {
          out[metricId].push(
            buildMetricComparison({
              current,
              currentWindow: anchor,
              comparison: null,
              comparisonWindow: null,
              missingReason: resolution.reason,
            }),
          );
          continue;
        }
        const comparison = await this.metricFor(metricId, resolution.window, scope);
        out[metricId].push(
          buildMetricComparison({
            current,
            currentWindow: anchor,
            comparison,
            comparisonWindow: resolution.window,
          }),
        );
      }
    }
    return out;
  }

  /** A breakdown compared across two windows without N+1 engine calls. */
  async getBreakdownComparison(
    metricId: string,
    groupBy: BreakdownGroup,
    anchor: AnalyticsWindow,
    comparisonKind: ComparisonWindowKind | null,
    scope: ScopeInput = {},
  ): Promise<BreakdownComparison> {
    const definition = METRIC_DEFINITIONS.get(metricId);
    const resolution =
      comparisonKind === null
        ? null
        : this.resolveComparison(comparisonKind, anchor);
    const windows = [
      anchor,
      ...(resolution && resolution.ok ? [resolution.window] : []),
    ];
    const session = await this.sessionFor(windows);

    const currentKey = `${metricId}|${groupBy}|${scopeKey(scope)}|${anchor.dateFrom}|${anchor.dateTo}`;
    let current = this.breakdownCache.get(currentKey);
    if (!current) {
      current = session.getBreakdownForWindow(
        metricId,
        groupBy,
        { dateFrom: anchor.dateFrom, dateTo: anchor.dateTo },
        scope,
      );
      this.breakdownCache.set(currentKey, current);
    } else {
      this.cacheHits++;
    }

    let comparisonRows = new Map<string, number | null>();
    let comparisonWindow: AnalyticsWindow | null = null;
    let eligibility: BreakdownComparison["eligibility"] = "eligible";
    let eligibilityReason: string | null = null;

    const metadata = getMetricAnalyticsMetadata(metricId);
    if (resolution && !resolution.ok) {
      eligibility = "window_not_derivable";
      eligibilityReason = resolution.reason;
    } else if (resolution && resolution.ok) {
      if (metadata && !metadata.historicallyComparable) {
        eligibility = "point_in_time_metric";
        eligibilityReason =
          "This metric reflects current configuration state; historical comparison is not meaningful.";
      } else {
        comparisonWindow = resolution.window;
        const comparisonKey = `${metricId}|${groupBy}|${scopeKey(scope)}|${comparisonWindow.dateFrom}|${comparisonWindow.dateTo}`;
        let previous = this.breakdownCache.get(comparisonKey);
        if (!previous) {
          previous = session.getBreakdownForWindow(
            metricId,
            groupBy,
            {
              dateFrom: comparisonWindow.dateFrom,
              dateTo: comparisonWindow.dateTo,
            },
            scope,
          );
          this.breakdownCache.set(comparisonKey, previous);
        } else {
          this.cacheHits++;
        }
        comparisonRows = new Map(previous.rows.map((r) => [r.key, r.value]));
      }
    } else if (comparisonKind === null) {
      eligibility = "missing_comparison_period";
      eligibilityReason = "No comparison requested.";
    }

    const percentOk = metadata?.percentChangeCompatible ?? false;
    return {
      metricId,
      groupBy,
      unit: definition?.unit ?? current.unit,
      currentWindow: anchor,
      comparisonWindow,
      eligibility,
      eligibilityReason,
      health: current.health,
      rows: current.rows.map((row) => {
        const comparisonValue = comparisonRows.get(row.key) ?? null;
        const bothNumeric = row.value !== null && comparisonValue !== null;
        return {
          key: row.key,
          label: row.label,
          currentValue: row.value,
          comparisonValue,
          absoluteVariance: bothNumeric ? row.value! - comparisonValue! : null,
          percentVarianceBp:
            bothNumeric && percentOk && comparisonValue! > 0
              ? Math.round(((row.value! - comparisonValue!) / comparisonValue!) * 10_000)
              : null,
        };
      }),
    };
  }

  /** Direct engine passthroughs for surfaces that need raw results. */
  async getMetricResult(
    metricId: string,
    window: AnalyticsWindow,
    scope: ScopeInput = {},
    filters: FilterInput = {},
  ): Promise<MetricResult> {
    return this.metricFor(metricId, window, scope, filters);
  }

  /**
   * The loaded dataset covering a window (cohort composition). Same
   * batched load as every metric — never a second query path.
   */
  async datasetFor(window: AnalyticsWindow): Promise<IntelligenceDataset> {
    const session = await this.sessionFor([window]);
    return session.dataset;
  }
}
