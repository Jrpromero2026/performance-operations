/** Pure reporting-period rules (unit-tested; mirrored by DB constraints). */

export type PeriodStatus = "draft" | "open" | "closed" | "locked";

/** Legal status transitions. locked → closed is the audited "reopen". */
export const PERIOD_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  draft: ["open"],
  open: ["closed"],
  closed: ["open", "locked"],
  locked: ["closed"],
};

export function canTransitionPeriod(from: string, to: string): boolean {
  return (PERIOD_TRANSITIONS[from as PeriodStatus] ?? []).includes(
    to as PeriodStatus
  );
}

/** Does changing a period in `fromStatus` require payroll:reopen? */
export function transitionRequiresReopen(fromStatus: string): boolean {
  return fromStatus === "locked";
}

export interface PeriodRange {
  periodType: string;
  start: string;
  end: string;
}

/**
 * Same-type overlap rule (mirrors the DB exclusion constraint): two periods
 * conflict only when they share an organization scope (assumed by caller),
 * the same period type, and overlapping inclusive date ranges.
 */
export function periodsConflict(a: PeriodRange, b: PeriodRange): boolean {
  if (a.periodType !== b.periodType) return false;
  return a.start <= b.end && b.start <= a.end;
}
