/**
 * Cohort analysis — pure composition over the engine's loaded facts.
 *
 * Cohort assignment uses the ENGINE's client-history definition (first
 * completed visit, org lifetime — the same map behind new_clients); no new
 * retention formula lives here. Cells count DISTINCT CLIENTS (never
 * appointments) with a completed session in the activity month. Client
 * identity never leaves this module: outputs are counts and period keys,
 * with configurable small-cohort suppression; per-client drill-down is a
 * separate, client:read-gated query in the cohort page.
 */

import type { IntelligenceDataset } from "@/lib/intelligence/shared/facts";
import { COMPLETED_STATUS } from "@/lib/intelligence/shared/facts";
import { generateBuckets } from "@/lib/intelligence/trends/engine";

export interface CohortScope {
  departmentId?: string;
  trainerId?: string;
  serviceId?: string;
}

export interface CohortCell {
  /** Activity month key (YYYY-MM). */
  month: string;
  /** Distinct active clients; null when suppressed. */
  activeClients: number | null;
  suppressed: boolean;
}

export interface CohortRow {
  /** Cohort month key (YYYY-MM of first completed visit). */
  cohortMonth: string;
  /** Clients whose first completed visit falls in the cohort month. */
  newClients: number | null;
  suppressed: boolean;
  cells: CohortCell[];
}

export interface CohortTable {
  /** Analysis window the table covers (whole months). */
  months: string[];
  rows: CohortRow[];
  /** Cells with 1..threshold−1 clients are suppressed; 0 disables. */
  suppressionThreshold: number;
  /** Clients excluded because identity is missing on their appointments. */
  clientsUnidentified: number;
  totalClients: number;
  totalActiveClientMonths: number;
}

/**
 * Build the first-visit cohort table from the dataset. The dataset's
 * appointment pool must cover [dateFrom, dateTo] — the analytics service
 * guarantees that by construction.
 */
export function buildCohortTable(
  dataset: IntelligenceDataset,
  window: { dateFrom: string; dateTo: string },
  scope: CohortScope = {},
  suppressionThreshold = 0,
): CohortTable {
  const monthBuckets = generateBuckets(window.dateFrom, window.dateTo, "monthly");
  const months = monthBuckets.map((b) => b.key);
  const monthOf = (date: string) => date.slice(0, 7);

  // Activity: clientId → set of active months, within scope + window.
  const activity = new Map<string, Set<string>>();
  let unidentified = 0;
  for (const f of dataset.appointments) {
    if (f.canonicalStatus !== COMPLETED_STATUS) continue;
    if (f.date < window.dateFrom || f.date > window.dateTo) continue;
    if (scope.departmentId && f.departmentId !== scope.departmentId) continue;
    if (scope.trainerId && f.trainerId !== scope.trainerId) continue;
    if (scope.serviceId && f.serviceId !== scope.serviceId) continue;
    if (f.clientId === null) {
      unidentified++;
      continue;
    }
    let set = activity.get(f.clientId);
    if (!set) activity.set(f.clientId, (set = new Set()));
    set.add(monthOf(f.date));
  }

  // Cohort assignment from the engine's lifetime first-visit map. Clients
  // active in the window but first seen BEFORE it belong to earlier
  // cohorts — they appear in rows only when their cohort month is in
  // range (the table is windowed, not truncated to look better).
  const cohortClients = new Map<string, Set<string>>(); // cohortMonth → clients
  for (const clientId of activity.keys()) {
    const first = dataset.clientHistory.firstVisit.get(clientId);
    if (!first) continue; // no lifetime completed visit on record
    const cohort = monthOf(first);
    let set = cohortClients.get(cohort);
    if (!set) cohortClients.set(cohort, (set = new Set()));
    set.add(clientId);
  }

  const suppress = (count: number): { value: number | null; suppressed: boolean } =>
    suppressionThreshold > 0 && count > 0 && count < suppressionThreshold
      ? { value: null, suppressed: true }
      : { value: count, suppressed: false };

  let totalActiveClientMonths = 0;
  const rows: CohortRow[] = months.map((cohortMonth) => {
    const members = cohortClients.get(cohortMonth) ?? new Set<string>();
    const newCount = suppress(members.size);
    const cells: CohortCell[] = months.map((month) => {
      if (month < cohortMonth) {
        return { month, activeClients: null, suppressed: false };
      }
      let active = 0;
      for (const clientId of members) {
        if (activity.get(clientId)?.has(month)) active++;
      }
      totalActiveClientMonths += active;
      const cell = suppress(active);
      return { month, activeClients: cell.value, suppressed: cell.suppressed };
    });
    return {
      cohortMonth,
      newClients: newCount.value,
      suppressed: newCount.suppressed,
      cells,
    };
  });

  return {
    months,
    rows,
    suppressionThreshold,
    clientsUnidentified: unidentified,
    totalClients: activity.size,
    totalActiveClientMonths,
  };
}
