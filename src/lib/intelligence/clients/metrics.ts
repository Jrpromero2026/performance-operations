/**
 * Client + retention metrics. Client identity comes from the canonical
 * ledger's client links; appointments without a linked client are counted
 * and surfaced as warnings, never silently dropped from totals.
 *
 * "Active" = at least one completed appointment in the window.
 */

import { perUnit, ratioBp, roundRatio } from "../shared/math";
import {
  appointmentGate,
  healthyValue,
  type EvalContext,
  type MetricEvaluator,
  type MetricOutcome,
} from "../shared/evaluate";
import {
  INTELLIGENCE_VERSION,
  type MetricDefinition,
} from "../shared/types";

function def(
  partial: Omit<MetricDefinition, "version" | "requiredPermission" | "selfPermission" | "scopes"> &
    Partial<Pick<MetricDefinition, "scopes">>,
): MetricDefinition {
  return {
    requiredPermission: "client:read",
    selfPermission: "trainer:read_self",
    scopes: ["organization", "department", "trainer", "service"],
    version: INTELLIGENCE_VERSION,
    ...partial,
  };
}

export const CLIENT_METRICS: MetricDefinition[] = [
  def({
    id: "active_clients",
    name: "Active clients",
    category: "clients",
    definition: "Distinct clients with ≥1 completed appointment in the window.",
    formula: "count(distinct client_id of completed)",
    unit: "count",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "inactive_clients",
    name: "Inactive clients",
    category: "clients",
    definition:
      "Clients who had completed appointments before the window ends but none inside it (organization lifetime view).",
    formula: "count(lifetime clients with first_visit ≤ dateTo) − active_clients",
    unit: "count",
    dependencies: ["active_clients", "dataset:client_history"],
    scopes: ["organization"],
  }),
  def({
    id: "new_clients",
    name: "New clients",
    category: "clients",
    definition:
      "Clients whose first-ever completed appointment falls inside the window.",
    formula: "count(clients with first_visit within range)",
    unit: "count",
    dependencies: ["dataset:client_history"],
    scopes: ["organization"],
  }),
  def({
    id: "returning_clients",
    name: "Returning clients",
    category: "clients",
    definition:
      "Active clients whose first visit predates the window.",
    formula: "active_clients − new_clients",
    unit: "count",
    dependencies: ["active_clients", "new_clients"],
    scopes: ["organization"],
  }),
  def({
    id: "sessions_per_client_x100",
    name: "Sessions per client",
    category: "clients",
    definition:
      "Completed appointments per active client (value × 100, two implied decimals).",
    formula: "completed ÷ active_clients × 100",
    unit: "sessions_per_client",
    dependencies: ["appointments_completed", "active_clients"],
  }),
  def({
    id: "revenue_per_client_cents",
    name: "Revenue per client",
    category: "clients",
    definition: "Listed revenue divided by active clients.",
    formula: "revenue_listed_cents ÷ active_clients",
    unit: "cents_per_client",
    dependencies: ["revenue_listed_cents", "active_clients"],
  }),
  def({
    id: "average_client_spend_cents",
    name: "Average client spend (paid)",
    category: "clients",
    definition:
      "Source-paid revenue divided by active clients; incomplete when the source omitted paid amounts.",
    formula: "revenue_paid_cents ÷ active_clients",
    unit: "cents_per_client",
    dependencies: ["revenue_paid_cents", "active_clients"],
  }),
  def({
    id: "client_retention_rate_bp",
    name: "Client retention",
    category: "retention",
    definition:
      "Share of the previous window's active clients who are active again in this window.",
    formula: "count(previous_active ∩ active) ÷ count(previous_active) × 10000",
    unit: "rate_bp",
    dependencies: ["active_clients", "dataset:client_history"],
    scopes: ["organization", "department", "trainer"],
  }),
  def({
    id: "visit_frequency_per_week_x100",
    name: "Visit frequency",
    category: "retention",
    definition:
      "Completed appointments per active client per week (value × 100).",
    formula: "completed ÷ active_clients ÷ weeks_in_range × 100",
    unit: "visits_per_week",
    dependencies: ["appointments_completed", "active_clients"],
  }),
  def({
    id: "client_first_visit",
    name: "First visit",
    category: "clients",
    definition: "The client's first-ever completed appointment date.",
    formula: "min(appointment_date of completed, lifetime)",
    unit: "date",
    dependencies: ["dataset:client_history"],
    scopes: ["client"],
  }),
  def({
    id: "client_last_visit",
    name: "Last visit",
    category: "clients",
    definition: "The client's most recent completed appointment date.",
    formula: "max(appointment_date of completed, lifetime)",
    unit: "date",
    dependencies: ["dataset:client_history"],
    scopes: ["client"],
  }),
  def({
    id: "client_growth_bp",
    name: "Client growth",
    category: "growth",
    definition:
      "Change in active clients vs the previous equal-length window.",
    formula: "(active − previous_active) ÷ previous_active × 10000",
    unit: "rate_bp",
    dependencies: ["active_clients"],
  }),
];

function gated(compute: (ctx: EvalContext) => MetricOutcome): MetricEvaluator {
  return (ctx) => appointmentGate(ctx) ?? compute(ctx);
}

function clientWarnings(ctx: EvalContext): string[] | undefined {
  return ctx.summary.clientMissing > 0
    ? [
        `${ctx.summary.clientMissing} completed appointment(s) have no linked client and are excluded from client metrics.`,
      ]
    : undefined;
}

/** Whole days in the inclusive range (single implementation). */
export function daysInRange(dateFrom: string, dateTo: string): number {
  const from = Date.UTC(
    Number(dateFrom.slice(0, 4)),
    Number(dateFrom.slice(5, 7)) - 1,
    Number(dateFrom.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(dateTo.slice(0, 4)),
    Number(dateTo.slice(5, 7)) - 1,
    Number(dateTo.slice(8, 10)),
  );
  return Math.round((to - from) / 86_400_000) + 1;
}

export const CLIENT_EVALUATORS: Record<string, MetricEvaluator> = {
  active_clients: gated((c) =>
    healthyValue(c.summary.clientIds.size, undefined, clientWarnings(c)),
  ),
  inactive_clients: gated((c) => {
    const lifetime = [...c.dataset.clientHistory.firstVisit.entries()].filter(
      ([, first]) => first <= c.filters.dateTo,
    ).length;
    return healthyValue(
      Math.max(lifetime - c.summary.clientIds.size, 0),
      { lifetime_clients: lifetime, active_clients: c.summary.clientIds.size },
      clientWarnings(c),
    );
  }),
  new_clients: gated((c) => {
    let count = 0;
    for (const id of c.summary.clientIds) {
      const first = c.dataset.clientHistory.firstVisit.get(id);
      if (first !== undefined && first >= c.filters.dateFrom && first <= c.filters.dateTo) {
        count++;
      }
    }
    return healthyValue(count, undefined, clientWarnings(c));
  }),
  returning_clients: gated((c) => {
    let newCount = 0;
    for (const id of c.summary.clientIds) {
      const first = c.dataset.clientHistory.firstVisit.get(id);
      if (first !== undefined && first >= c.filters.dateFrom && first <= c.filters.dateTo) {
        newCount++;
      }
    }
    return healthyValue(
      c.summary.clientIds.size - newCount,
      { active_clients: c.summary.clientIds.size, new_clients: newCount },
      clientWarnings(c),
    );
  }),
  sessions_per_client_x100: gated((c) =>
    healthyValue(
      c.summary.clientIds.size === 0
        ? null
        : roundRatio(c.summary.completed * 100, c.summary.clientIds.size),
      {
        completed: c.summary.completed,
        active_clients: c.summary.clientIds.size,
      },
      clientWarnings(c),
    ),
  ),
  revenue_per_client_cents: gated((c) =>
    healthyValue(
      perUnit(c.summary.completedListedCents, c.summary.clientIds.size),
      undefined,
      clientWarnings(c),
    ),
  ),
  average_client_spend_cents: gated((c) => {
    if (!c.dataset.flags.paidAmountsPresent) {
      return {
        value: null,
        health: "incomplete",
        reasons: [
          "The import source did not provide paid amounts — spend cannot be reported.",
        ],
      };
    }
    return healthyValue(
      perUnit(c.summary.completedPaidCents, c.summary.clientIds.size),
      undefined,
      clientWarnings(c),
    );
  }),
  client_retention_rate_bp: gated((c) => {
    const previous = c.previousSummary.clientIds;
    if (previous.size === 0) {
      return {
        value: null,
        health: "incomplete",
        reasons: [
          "No active clients in the previous window — retention is undefined.",
        ],
      };
    }
    let retained = 0;
    for (const id of previous) if (c.summary.clientIds.has(id)) retained++;
    return healthyValue(ratioBp(retained, previous.size), {
      retained,
      previous_active: previous.size,
    });
  }),
  visit_frequency_per_week_x100: gated((c) => {
    const days = daysInRange(c.filters.dateFrom, c.filters.dateTo);
    if (c.summary.clientIds.size === 0) {
      return healthyValue(null, { days }, clientWarnings(c));
    }
    // completed ÷ clients ÷ (days/7) × 100 = completed × 700 ÷ (clients × days)
    return healthyValue(
      roundRatio(c.summary.completed * 700, c.summary.clientIds.size * days),
      { completed: c.summary.completed, days },
      clientWarnings(c),
    );
  }),
  client_first_visit: gated((c) => {
    const clientId = c.scope.clientId;
    const date = clientId
      ? (c.dataset.clientHistory.firstVisit.get(clientId) ?? null)
      : null;
    if (!clientId) {
      return {
        value: null,
        health: "unavailable",
        reasons: ["client_first_visit requires client scope."],
      };
    }
    return { value: null, health: date ? "healthy" : "incomplete", metadata: { date }, reasons: date ? undefined : ["No completed visits recorded for this client."] };
  }),
  client_last_visit: gated((c) => {
    const clientId = c.scope.clientId;
    if (!clientId) {
      return {
        value: null,
        health: "unavailable",
        reasons: ["client_last_visit requires client scope."],
      };
    }
    const date = c.dataset.clientHistory.lastVisit.get(clientId) ?? null;
    return { value: null, health: date ? "healthy" : "incomplete", metadata: { date }, reasons: date ? undefined : ["No completed visits recorded for this client."] };
  }),
  client_growth_bp: gated((c) => {
    const previous = c.previousSummary.clientIds.size;
    if (previous === 0) {
      return {
        value: null,
        health: "incomplete",
        reasons: [
          "No active clients in the previous window — growth is undefined.",
        ],
      };
    }
    return healthyValue(
      ratioBp(c.summary.clientIds.size - previous, previous),
      { current: c.summary.clientIds.size, previous },
    );
  }),
};
