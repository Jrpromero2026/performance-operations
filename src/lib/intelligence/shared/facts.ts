/**
 * Fact shapes the engine computes over, plus pure scope/filter helpers.
 * Facts are loaded once per request (datasets.ts) and shared by every
 * metric — no metric issues its own SQL.
 */

import type { MetricFilters, MetricScope } from "./types";

/** One active canonical-ledger appointment (source of appointment truth). */
export interface AppointmentFact {
  id: string;
  organizationId: string;
  departmentId: string | null;
  trainerId: string;
  serviceId: string;
  clientId: string | null;
  /** Local calendar date (YYYY-MM-DD) — all period math uses this. */
  date: string;
  durationMinutes: number;
  canonicalStatus: string;
  listedCents: number | null;
  paidCents: number | null;
  countsAsSession: boolean;
  countsAsCoachingHours: boolean;
  isGroupTraining: boolean;
  isEvaluation: boolean;
}

/** One trainer summary from a FINALIZED (posted/locked) payroll run. */
export interface PayrollTrainerFact {
  runId: string;
  organizationId: string;
  reportingPeriodId: string;
  periodStart: string;
  periodEnd: string;
  runStatus: "posted" | "locked";
  trainerId: string;
  finalGrossCents: number;
  commissionCents: number;
  flatCents: number;
  hourlyCents: number;
  teamCents: number;
  bonusCents: number;
  deductionCents: number;
  adjustmentCents: number;
  compensatedMinutes: number;
  appointmentCount: number;
  completedSessionCount: number;
  /** Compensation method of the trainer's primary plan version, if known. */
  compensationMethod: string | null;
}

/** One calculated line from a finalized run (for service/method breakdowns). */
export interface PayrollLineFact {
  runId: string;
  organizationId: string;
  trainerId: string;
  lineType: string;
  amountCents: number;
  serviceId: string | null;
  departmentId: string | null;
  compensationMethod: string | null;
}

/** Org-level pipeline state used for metric health (never fake zeros). */
export interface OrgDataFlags {
  /** At least one import batch has ever been posted for the organization. */
  hasPostedImports: boolean;
  /** At least one posted/locked payroll run exists for the organization. */
  hasAnyFinalizedPayroll: boolean;
  /** A finalized run's period overlaps the requested range. */
  hasFinalizedPayrollInRange: boolean;
  /** Any in-range appointment carries a source paid amount. */
  paidAmountsPresent: boolean;
}

export interface ReadinessFacts {
  /** Active trainers on the organization roster (active org assignment). */
  trainersActive: number;
  /** Roster trainers with an active department assignment. */
  trainersWithDepartment: number;
  /** Roster trainers with an active compensation plan assignment. */
  trainersWithCompensation: number;
  servicesActive: number;
  servicesWithAlias: number;
  /** Reporting periods that fully cover the requested date range. */
  rangeCoveredByPeriods: boolean;
  openImportBlockingIssues: number;
  importBatchesAwaitingAction: number;
  openPayrollBlockingIssues: number;
  activePayrollRunsNotFinalized: number;
}

export interface ClientHistoryFacts {
  /** clientId → first-ever completed visit date (org lifetime). */
  firstVisit: Map<string, string>;
  /** clientId → most recent completed visit date (org lifetime). */
  lastVisit: Map<string, string>;
  /** Clients with a completed session in the previous equal-length window. */
  previousWindowActive: Set<string>;
}

/**
 * Latest recorded GMS club snapshot, carried with its provenance so any
 * metric built on it can state the as-of date and never present a manual
 * reading as live data. Null when no snapshot has ever been recorded.
 */
export interface ClubSnapshotFacts {
  asOfDate: string;
  periodStart: string;
  periodEnd: string;
  /** metric key → value (integers; counts). */
  values: Map<string, number>;
}

export interface IntelligenceDataset {
  organizationId: string;
  dateFrom: string;
  dateTo: string;
  /**
   * POOLED active appointments covering the current window, the previous
   * equal-length window, and the previous-year window. Every consumer
   * narrows by scope + date filters (scopeAppointments) — nothing reads
   * the pool unfiltered.
   */
  appointments: AppointmentFact[];
  /** Earliest date guaranteed covered by the appointment pool. */
  loadedFrom: string;
  /** Pooled finalized payroll facts overlapping the loaded ranges. */
  payroll: PayrollTrainerFact[];
  payrollLines: PayrollLineFact[];
  clientHistory: ClientHistoryFacts;
  flags: OrgDataFlags;
  readiness: ReadinessFacts;
  /** Latest recorded GMS snapshot, or null when none exists. */
  clubSnapshot: ClubSnapshotFacts | null;
  /** Display names for breakdown labels. */
  names: {
    trainers: Map<string, string>;
    departments: Map<string, string>;
    services: Map<string, string>;
  };
}

/* ------------------------------------------------------- pure filtering */

/** Narrow appointment facts to a scope + filters. Single implementation. */
export function scopeAppointments(
  facts: readonly AppointmentFact[],
  scope: MetricScope,
  filters: MetricFilters,
): AppointmentFact[] {
  return facts.filter((f) => {
    if (f.organizationId !== scope.organizationId) return false;
    if (scope.departmentId && f.departmentId !== scope.departmentId) return false;
    if (scope.trainerId && f.trainerId !== scope.trainerId) return false;
    if (scope.serviceId && f.serviceId !== scope.serviceId) return false;
    if (scope.clientId && f.clientId !== scope.clientId) return false;
    if (filters.serviceId && f.serviceId !== filters.serviceId) return false;
    if (filters.clientId && f.clientId !== filters.clientId) return false;
    if (
      filters.appointmentStatuses &&
      filters.appointmentStatuses.length > 0 &&
      !filters.appointmentStatuses.includes(f.canonicalStatus)
    ) {
      return false;
    }
    if (f.date < filters.dateFrom || f.date > filters.dateTo) return false;
    return true;
  });
}

/** Narrow payroll facts to a scope + filters. Single implementation. */
export function scopePayroll(
  facts: readonly PayrollTrainerFact[],
  scope: MetricScope,
  filters: MetricFilters,
): PayrollTrainerFact[] {
  return facts.filter((f) => {
    if (f.organizationId !== scope.organizationId) return false;
    if (scope.trainerId && f.trainerId !== scope.trainerId) return false;
    if (
      filters.compensationMethod &&
      f.compensationMethod !== filters.compensationMethod
    ) {
      return false;
    }
    // Payroll periods overlap the date range (payroll is period-grained).
    return f.periodStart <= filters.dateTo && f.periodEnd >= filters.dateFrom;
  });
}

/* ------------------------------------------------ appointment summaries */

/** Canonical status buckets — the ONE place status semantics live. */
export const COMPLETED_STATUS = "completed";
export const SCHEDULED_STATUS = "scheduled";
export const CANCELLED_STATUS = "cancelled";
export const LATE_CANCELLED_STATUS = "late_cancelled";
export const NO_SHOW_STATUS = "no_show";
export const RESCHEDULED_STATUS = "rescheduled";

/** Statuses that represent a booked commitment (denominator for rates). */
export function isBookedStatus(status: string): boolean {
  return [
    SCHEDULED_STATUS,
    COMPLETED_STATUS,
    CANCELLED_STATUS,
    LATE_CANCELLED_STATUS,
    NO_SHOW_STATUS,
  ].includes(status);
}

export interface AppointmentSummary {
  total: number;
  booked: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  lateCancelled: number;
  noShow: number;
  rescheduled: number;
  completedDurations: number[];
  /** Minutes of completed appointments (all services). */
  completedMinutes: number;
  /** Minutes of completed appointments whose service counts as coaching. */
  coachingMinutes: number;
  /** Minutes of booked appointments (scheduled work, all outcomes). */
  bookedMinutes: number;
  /** Listed cents over completed appointments (null values excluded). */
  completedListedCents: number;
  completedListedMissing: number;
  /** Paid cents over completed appointments (null values excluded). */
  completedPaidCents: number;
  completedPaidMissing: number;
  completedSessionCount: number; // completed AND service counts_as_session
  groupSessions: number;
  evaluationSessions: number;
  clientIds: Set<string>;
  clientMissing: number;
}

/** THE appointment aggregation. Every appointment metric derives from it. */
export function summarizeAppointments(
  facts: readonly AppointmentFact[],
): AppointmentSummary {
  const s: AppointmentSummary = {
    total: facts.length,
    booked: 0,
    scheduled: 0,
    completed: 0,
    cancelled: 0,
    lateCancelled: 0,
    noShow: 0,
    rescheduled: 0,
    completedDurations: [],
    completedMinutes: 0,
    coachingMinutes: 0,
    bookedMinutes: 0,
    completedListedCents: 0,
    completedListedMissing: 0,
    completedPaidCents: 0,
    completedPaidMissing: 0,
    completedSessionCount: 0,
    groupSessions: 0,
    evaluationSessions: 0,
    clientIds: new Set<string>(),
    clientMissing: 0,
  };
  for (const f of facts) {
    if (isBookedStatus(f.canonicalStatus)) {
      s.booked++;
      s.bookedMinutes += f.durationMinutes;
    }
    switch (f.canonicalStatus) {
      case SCHEDULED_STATUS:
        s.scheduled++;
        break;
      case COMPLETED_STATUS: {
        s.completed++;
        s.completedDurations.push(f.durationMinutes);
        s.completedMinutes += f.durationMinutes;
        if (f.countsAsCoachingHours) s.coachingMinutes += f.durationMinutes;
        if (f.countsAsSession) s.completedSessionCount++;
        if (f.isGroupTraining) s.groupSessions++;
        if (f.isEvaluation) s.evaluationSessions++;
        if (f.listedCents === null) s.completedListedMissing++;
        else s.completedListedCents += f.listedCents;
        if (f.paidCents === null) s.completedPaidMissing++;
        else s.completedPaidCents += f.paidCents;
        if (f.clientId === null) s.clientMissing++;
        else s.clientIds.add(f.clientId);
        break;
      }
      case CANCELLED_STATUS:
        s.cancelled++;
        break;
      case LATE_CANCELLED_STATUS:
        s.lateCancelled++;
        break;
      case NO_SHOW_STATUS:
        s.noShow++;
        break;
      case RESCHEDULED_STATUS:
        s.rescheduled++;
        break;
    }
  }
  return s;
}

/* ----------------------------------------------------- payroll summaries */

export interface PayrollSummary {
  runCount: number;
  trainerCount: number;
  grossCents: number;
  commissionCents: number;
  flatCents: number;
  hourlyCents: number;
  teamCents: number;
  bonusCents: number;
  deductionCents: number;
  adjustmentCents: number;
  compensatedMinutes: number;
  completedSessionCount: number;
}

/** THE payroll aggregation. Every payroll metric derives from it. */
export function summarizePayroll(
  facts: readonly PayrollTrainerFact[],
): PayrollSummary {
  const runIds = new Set<string>();
  const trainerIds = new Set<string>();
  const s: PayrollSummary = {
    runCount: 0,
    trainerCount: 0,
    grossCents: 0,
    commissionCents: 0,
    flatCents: 0,
    hourlyCents: 0,
    teamCents: 0,
    bonusCents: 0,
    deductionCents: 0,
    adjustmentCents: 0,
    compensatedMinutes: 0,
    completedSessionCount: 0,
  };
  for (const f of facts) {
    runIds.add(f.runId);
    trainerIds.add(f.trainerId);
    s.grossCents += f.finalGrossCents;
    s.commissionCents += f.commissionCents;
    s.flatCents += f.flatCents;
    s.hourlyCents += f.hourlyCents;
    s.teamCents += f.teamCents;
    s.bonusCents += f.bonusCents;
    s.deductionCents += f.deductionCents;
    s.adjustmentCents += f.adjustmentCents;
    s.compensatedMinutes += f.compensatedMinutes;
    s.completedSessionCount += f.completedSessionCount;
  }
  s.runCount = runIds.size;
  s.trainerCount = trainerIds.size;
  return s;
}
