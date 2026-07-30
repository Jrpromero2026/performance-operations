/**
 * The reporting service — the ONE internal analytics API. Every surface
 * (reports page, exports, future dashboards/mobile/API/AI) creates a
 * session and requests metrics; nobody else issues analytics SQL or
 * implements a formula.
 *
 * Permission model (deny by default, narrows before any evaluation):
 *  - org access      → any scope inside the organization
 *  - department access (department-scoped roles) → only their departments
 *  - self access     → scope forced to the actor's own trainer record
 *  - none            → "unavailable" result, never data
 * RLS underneath re-enforces all of this on the actual rows.
 */

import type { ActorContext } from "@/lib/actions/shared";
import {
  DEPARTMENT_SCOPED_ROLES,
  ROLE_PERMISSIONS,
  type Permission,
} from "@/lib/authz/permissions";
import type { MembershipGrant } from "@/lib/authz/authz";
import { METRIC_DEFINITIONS, METRIC_EVALUATORS } from "./catalog";
import { loadIntelligenceDataset } from "./datasets";
import { buildContext, buildWindowContext } from "./shared/context";
import { computeBreakdown, type BreakdownGroup } from "./shared/breakdowns";
import { generateExecutiveSummary } from "./summaries/executive";
import {
  buildComparison,
  generateBuckets,
  previousPeriodRange,
  previousYearRange,
} from "./trends/engine";
import type { IntelligenceDataset } from "./shared/facts";
import {
  INTELLIGENCE_VERSION,
  type ExecutiveSummaryItem,
  type MetricBreakdown,
  type MetricDefinition,
  type MetricFilters,
  type MetricResult,
  type MetricScope,
  type TrendGranularity,
  type TrendPoint,
  type TrendResult,
} from "./shared/types";

export type AccessLevel =
  | { kind: "org" }
  | { kind: "departments"; departmentIds: string[] }
  | { kind: "self"; trainerId: string }
  | { kind: "none" };

/** Resolve what the actor may see for a given permission requirement. */
export function resolveAccess(
  memberships: MembershipGrant[],
  organizationId: string,
  requiredPermission: Permission,
  selfPermission: Permission | undefined,
  selfTrainerId: string | null,
): AccessLevel {
  const orgMemberships = memberships.filter(
    (m) => m.organizationId === organizationId || m.roleKey === "platform_admin",
  );
  const departmentIds: string[] = [];
  let hasDepartmentScoped = false;
  for (const membership of orgMemberships) {
    const permissions = ROLE_PERMISSIONS[membership.roleKey] ?? [];
    if (!permissions.includes(requiredPermission)) continue;
    if (DEPARTMENT_SCOPED_ROLES.includes(membership.roleKey)) {
      hasDepartmentScoped = true;
      departmentIds.push(...(membership.departmentIds ?? []));
    } else {
      return { kind: "org" };
    }
  }
  if (hasDepartmentScoped) {
    return { kind: "departments", departmentIds: [...new Set(departmentIds)] };
  }
  if (
    selfPermission &&
    selfTrainerId &&
    orgMemberships.some((m) =>
      (ROLE_PERMISSIONS[m.roleKey] ?? []).includes(selfPermission),
    )
  ) {
    return { kind: "self", trainerId: selfTrainerId };
  }
  return { kind: "none" };
}

export interface ScopeInput {
  departmentId?: string;
  trainerId?: string;
  serviceId?: string;
  clientId?: string;
}

export interface FilterInput {
  appointmentStatuses?: string[];
  compensationMethod?: string;
  serviceId?: string;
  clientId?: string;
  reportingPeriodId?: string;
}

function deniedResult(
  definition: MetricDefinition,
  scope: MetricScope,
  filters: MetricFilters,
  reason: string,
): MetricResult {
  return {
    metricId: definition.id,
    scope,
    filters,
    value: null,
    unit: definition.unit,
    health: "unavailable",
    reasons: [reason],
    warnings: [],
    metadata: {},
    dependencies: definition.dependencies,
    calculatedAt: new Date().toISOString(),
    version: INTELLIGENCE_VERSION,
  };
}

export class IntelligenceSession {
  private constructor(
    private readonly actor: ActorContext,
    readonly dataset: IntelligenceDataset,
    private readonly selfTrainerId: string | null,
  ) {}

  static async create(
    actor: ActorContext,
    organizationId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<IntelligenceSession> {
    const { data: self } = await actor.supabase
      .from("trainers")
      .select("id")
      .eq("profile_id", actor.userId)
      .maybeSingle();
    const dataset = await loadIntelligenceDataset(
      actor,
      organizationId,
      dateFrom,
      dateTo,
    );
    return new IntelligenceSession(actor, dataset, self?.id ?? null);
  }

  /**
   * Resolve the effective scope for a metric, or a denial reason. Scope
   * requests can only ever NARROW what the permission level allows.
   */
  private effectiveScope(
    definition: MetricDefinition,
    requested: ScopeInput,
  ): { scope: MetricScope } | { denied: string } {
    const access = resolveAccess(
      this.actor.memberships,
      this.dataset.organizationId,
      definition.requiredPermission,
      definition.selfPermission,
      this.selfTrainerId,
    );
    const base: MetricScope = {
      organizationId: this.dataset.organizationId,
      ...requested,
    };
    if (access.kind === "org") return { scope: base };
    if (access.kind === "departments") {
      if (!requested.departmentId) {
        return {
          denied:
            "Your access is department-scoped — choose one of your departments to view this metric.",
        };
      }
      if (!access.departmentIds.includes(requested.departmentId)) {
        return { denied: "You do not have access to this department." };
      }
      return { scope: base };
    }
    if (access.kind === "self") {
      if (requested.trainerId && requested.trainerId !== access.trainerId) {
        return { denied: "You can only view your own metrics." };
      }
      if (!definition.scopes.includes("trainer")) {
        return { denied: "This metric has no per-trainer view." };
      }
      // Self access is EXACTLY the trainer's own slice — no departmental
      // or organizational aggregates.
      return {
        scope: {
          organizationId: this.dataset.organizationId,
          trainerId: access.trainerId,
        },
      };
    }
    return { denied: "You do not have permission to view this metric." };
  }

  private buildFilters(filters: FilterInput = {}): MetricFilters {
    return {
      dateFrom: this.dataset.dateFrom,
      dateTo: this.dataset.dateTo,
      reportingPeriodId: filters.reportingPeriodId,
      appointmentStatuses: filters.appointmentStatuses,
      compensationMethod: filters.compensationMethod,
      serviceId: filters.serviceId,
      clientId: filters.clientId,
    };
  }

  getMetric(
    metricId: string,
    scopeInput: ScopeInput = {},
    filterInput: FilterInput = {},
  ): MetricResult {
    const definition = METRIC_DEFINITIONS.get(metricId);
    const filters = this.buildFilters(filterInput);
    if (!definition) {
      return deniedResult(
        {
          id: metricId,
          name: metricId,
          category: "appointments",
          definition: "",
          formula: "",
          unit: "count",
          dependencies: [],
          scopes: [],
          requiredPermission: "org:read",
          version: INTELLIGENCE_VERSION,
        },
        { organizationId: this.dataset.organizationId },
        filters,
        `Unknown metric: ${metricId}`,
      );
    }
    const resolved = this.effectiveScope(definition, scopeInput);
    if ("denied" in resolved) {
      return deniedResult(
        definition,
        { organizationId: this.dataset.organizationId, ...scopeInput },
        filters,
        resolved.denied,
      );
    }
    const evaluator = METRIC_EVALUATORS.get(metricId)!;
    const outcome = evaluator(buildContext(this.dataset, resolved.scope, filters));
    return {
      metricId,
      scope: resolved.scope,
      filters,
      value: outcome.value,
      unit: definition.unit,
      health: outcome.health,
      reasons: outcome.reasons ?? [],
      warnings: outcome.warnings ?? [],
      metadata: outcome.metadata ?? {},
      dependencies: definition.dependencies,
      calculatedAt: new Date().toISOString(),
      version: INTELLIGENCE_VERSION,
    };
  }

  getMetrics(
    metricIds: string[],
    scope: ScopeInput = {},
    filters: FilterInput = {},
  ): MetricResult[] {
    return metricIds.map((id) => this.getMetric(id, scope, filters));
  }

  /**
   * Evaluate a metric over an arbitrary sub-window of the loaded dataset
   * (multi-period analytics — same mechanism trend buckets use). Windows
   * outside the session's primary range return unavailable: the pooled
   * facts are only guaranteed contiguous inside it, and a silently
   * partial number is worse than an honest refusal.
   */
  getMetricForWindow(
    metricId: string,
    window: { dateFrom: string; dateTo: string },
    scopeInput: ScopeInput = {},
    filterInput: FilterInput = {},
  ): MetricResult {
    const definition = METRIC_DEFINITIONS.get(metricId);
    const filters: MetricFilters = {
      ...this.buildFilters(filterInput),
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
    };
    if (!definition) {
      return deniedResult(
        {
          id: metricId,
          name: metricId,
          category: "appointments",
          definition: "",
          formula: "",
          unit: "count",
          dependencies: [],
          scopes: [],
          requiredPermission: "org:read",
          version: INTELLIGENCE_VERSION,
        },
        { organizationId: this.dataset.organizationId },
        filters,
        `Unknown metric: ${metricId}`,
      );
    }
    if (
      window.dateFrom < this.dataset.dateFrom ||
      window.dateTo > this.dataset.dateTo
    ) {
      return deniedResult(
        definition,
        { organizationId: this.dataset.organizationId, ...scopeInput },
        filters,
        "The requested window is outside this session's loaded range.",
      );
    }
    const resolved = this.effectiveScope(definition, scopeInput);
    if ("denied" in resolved) {
      return deniedResult(
        definition,
        { organizationId: this.dataset.organizationId, ...scopeInput },
        filters,
        resolved.denied,
      );
    }
    const evaluator = METRIC_EVALUATORS.get(metricId)!;
    const outcome = evaluator(
      buildWindowContext(
        this.dataset,
        resolved.scope,
        filters,
        window.dateFrom,
        window.dateTo,
      ),
    );
    return {
      metricId,
      scope: resolved.scope,
      filters,
      value: outcome.value,
      unit: definition.unit,
      health: outcome.health,
      reasons: outcome.reasons ?? [],
      warnings: outcome.warnings ?? [],
      metadata: outcome.metadata ?? {},
      dependencies: definition.dependencies,
      calculatedAt: new Date().toISOString(),
      version: INTELLIGENCE_VERSION,
    };
  }

  /** Breakdown over an arbitrary sub-window (same rules as getBreakdown). */
  getBreakdownForWindow(
    metricId: string,
    groupBy: BreakdownGroup,
    window: { dateFrom: string; dateTo: string },
    scopeInput: ScopeInput = {},
    filterInput: FilterInput = {},
  ): MetricBreakdown {
    const definition = METRIC_DEFINITIONS.get(metricId);
    const filters: MetricFilters = {
      ...this.buildFilters(filterInput),
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
    };
    if (!definition) {
      return {
        metricId,
        groupBy,
        unit: "count",
        rows: [],
        health: "unavailable",
        reasons: [`Unknown metric: ${metricId}`],
      };
    }
    if (
      window.dateFrom < this.dataset.dateFrom ||
      window.dateTo > this.dataset.dateTo
    ) {
      return {
        metricId,
        groupBy,
        unit: definition.unit,
        rows: [],
        health: "unavailable",
        reasons: ["The requested window is outside this session's loaded range."],
      };
    }
    const access = resolveAccess(
      this.actor.memberships,
      this.dataset.organizationId,
      definition.requiredPermission,
      definition.selfPermission,
      this.selfTrainerId,
    );
    const resolved = this.effectiveScope(definition, scopeInput);
    if ("denied" in resolved || access.kind === "self") {
      const reason =
        "denied" in resolved
          ? resolved.denied
          : "Breakdowns are not available with self-scoped access.";
      return {
        metricId,
        groupBy,
        unit: definition.unit,
        rows: [],
        health: "unavailable",
        reasons: [reason],
      };
    }
    return computeBreakdown(this.dataset, resolved.scope, filters, metricId, groupBy);
  }

  /** Breakdowns require non-self access (a trainer has no peers to list). */
  getBreakdown(
    metricId: string,
    groupBy: BreakdownGroup,
    scopeInput: ScopeInput = {},
    filterInput: FilterInput = {},
  ): MetricBreakdown {
    const definition = METRIC_DEFINITIONS.get(metricId);
    const filters = this.buildFilters(filterInput);
    if (!definition) {
      return {
        metricId,
        groupBy,
        unit: "count",
        rows: [],
        health: "unavailable",
        reasons: [`Unknown metric: ${metricId}`],
      };
    }
    const access = resolveAccess(
      this.actor.memberships,
      this.dataset.organizationId,
      definition.requiredPermission,
      definition.selfPermission,
      this.selfTrainerId,
    );
    const resolved = this.effectiveScope(definition, scopeInput);
    if ("denied" in resolved || access.kind === "self") {
      const reason =
        "denied" in resolved
          ? resolved.denied
          : "Breakdowns are not available with self-scoped access.";
      return {
        metricId,
        groupBy,
        unit: definition.unit,
        rows: [],
        health: "unavailable",
        reasons: [reason],
      };
    }
    return computeBreakdown(this.dataset, resolved.scope, filters, metricId, groupBy);
  }

  getTrend(
    metricId: string,
    granularity: TrendGranularity,
    scopeInput: ScopeInput = {},
    filterInput: FilterInput = {},
  ): TrendResult {
    const definition = METRIC_DEFINITIONS.get(metricId);
    const filters = this.buildFilters(filterInput);
    if (!definition) {
      return {
        metricId,
        granularity,
        points: [],
        comparisons: [],
        unit: "count",
        version: INTELLIGENCE_VERSION,
      };
    }
    const resolved = this.effectiveScope(definition, scopeInput);
    if ("denied" in resolved) {
      return {
        metricId,
        granularity,
        points: [],
        comparisons: [],
        unit: definition.unit,
        version: INTELLIGENCE_VERSION,
      };
    }
    const evaluator = METRIC_EVALUATORS.get(metricId)!;
    const points: TrendPoint[] = generateBuckets(
      filters.dateFrom,
      filters.dateTo,
      granularity,
    ).map((bucket) => {
      const outcome = evaluator(
        buildWindowContext(
          this.dataset,
          resolved.scope,
          filters,
          bucket.dateFrom,
          bucket.dateTo,
        ),
      );
      return { ...bucket, value: outcome.value, health: outcome.health };
    });

    const current = evaluator(
      buildContext(this.dataset, resolved.scope, filters),
    ).value;
    const previousPeriod = previousPeriodRange(filters.dateFrom, filters.dateTo);
    const previousYear = previousYearRange(filters.dateFrom, filters.dateTo);
    const previousPeriodValue = evaluator(
      buildWindowContext(
        this.dataset,
        resolved.scope,
        filters,
        previousPeriod.dateFrom,
        previousPeriod.dateTo,
      ),
    ).value;
    const previousYearValue = evaluator(
      buildWindowContext(
        this.dataset,
        resolved.scope,
        filters,
        previousYear.dateFrom,
        previousYear.dateTo,
      ),
    ).value;

    return {
      metricId,
      granularity,
      points,
      comparisons: [
        buildComparison("previous_period", current, previousPeriodValue),
        buildComparison("previous_year", current, previousYearValue),
      ],
      unit: definition.unit,
      version: INTELLIGENCE_VERSION,
    };
  }

  /** Executive summaries require org-level report management access. */
  getExecutiveSummary(): { allowed: boolean; items: ExecutiveSummaryItem[] } {
    const access = resolveAccess(
      this.actor.memberships,
      this.dataset.organizationId,
      "report:manage",
      undefined,
      null,
    );
    if (access.kind !== "org") return { allowed: false, items: [] };
    return {
      allowed: true,
      items: generateExecutiveSummary(
        this.dataset,
        { organizationId: this.dataset.organizationId },
        this.buildFilters(),
      ),
    };
  }
}
