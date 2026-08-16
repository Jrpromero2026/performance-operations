/**
 * Unified data-freshness model.
 *
 * Every source that feeds Timberhill PT intelligence reports its currency
 * the same way, so a report — or a future PT Director — can qualify any
 * number before stating it. The rule this model enforces is the one
 * Phase F called out as the single most dangerous failure mode:
 *
 *   An empty dataset must read as "no data", never as zero.
 *
 * A source with no data at all is `never_loaded`, and callers are expected
 * to refuse to quote quantitative results from it rather than reporting
 * a truthful-but-misleading 0.
 *
 * Pure functions. The caller supplies "today", so freshness is testable
 * and two runs over the same data agree.
 */

import { assessStaleness, daysBetween, type Staleness } from "@/lib/snapshots/provenance";

export type SourceKind = "appointments" | "club_membership" | "payroll" | "coaching";

export type SourceState =
  | "never_loaded"
  | "not_connected"
  | "current"
  | "aging"
  | "stale"
  | "error";

export interface SourceFreshness {
  key: string;
  label: string;
  kind: SourceKind;
  state: SourceState;
  /** How the data arrives; drives whether staleness is a process problem. */
  ingest: "automated" | "manual_snapshot" | "not_connected";
  /**
   * The date through which this source's data is believed complete. This
   * is the number reports must quote — NOT "last sync", which only says
   * when we last asked.
   */
  dataThroughDate: string | null;
  /** When the source was last successfully read/imported. */
  lastLoadedAt: string | null;
  /** Human-readable, always safe to print. */
  summary: string;
  /** Why the source is in this state, when that needs explaining. */
  detail: string | null;
}

export interface FreshnessReport {
  asOf: string;
  sources: SourceFreshness[];
  /** True when NO source has usable data — quantitative answers must be refused. */
  isEmpty: boolean;
  /** Sources that have data but are behind. */
  staleSources: string[];
}

export interface FreshnessInputs {
  todayIsoDate: string;
  appointments: {
    /** Latest appointment_date present in the ledger, if any. */
    latestAppointmentDate: string | null;
    /** Most recent posted import batch. */
    lastImportAt: string | null;
    /** Most recent successful integration sync, when a connection exists. */
    lastSyncAt: string | null;
    /** Whether an appointment integration is connected AND active. */
    connectionActive: boolean;
    postedAppointmentCount: number;
  };
  clubMembership: {
    latestSnapshotAsOf: string | null;
    latestSnapshotEnteredAt: string | null;
    snapshotCount: number;
  };
  payroll: {
    /** End date of the latest period with a finalized (posted/locked) run. */
    latestFinalizedPeriodEnd: string | null;
    latestFinalizedAt: string | null;
    finalizedRunCount: number;
  };
}

/**
 * Appointment data is expected to arrive continuously, so its tolerance
 * is much tighter than the monthly manual-snapshot cadence.
 */
const APPOINTMENT_AGING_DAYS = 3;
const APPOINTMENT_STALE_DAYS = 10;

function appointmentState(age: number | null): Staleness {
  if (age === null) return "unknown";
  if (age >= APPOINTMENT_STALE_DAYS) return "stale";
  if (age >= APPOINTMENT_AGING_DAYS) return "aging";
  return "current";
}

function stalenessToState(staleness: Staleness): SourceState {
  return staleness === "unknown" ? "never_loaded" : staleness;
}

export function buildFreshnessReport(inputs: FreshnessInputs): FreshnessReport {
  const today = inputs.todayIsoDate;
  const sources: SourceFreshness[] = [];

  /* ------------------------------------------------------ appointments */
  const appt = inputs.appointments;
  if (appt.postedAppointmentCount === 0) {
    sources.push({
      key: "setmore",
      label: "Setmore appointments",
      kind: "appointments",
      state: "never_loaded",
      ingest: appt.connectionActive ? "automated" : "manual_snapshot",
      dataThroughDate: null,
      lastLoadedAt: appt.lastImportAt ?? appt.lastSyncAt,
      summary: "No appointment data has been loaded.",
      detail:
        "No import batch has been posted and no sync has delivered appointments. Quantitative results must not be reported from this source — a zero here means 'unknown', not 'none happened'.",
    });
  } else {
    const age = daysBetween(appt.latestAppointmentDate ?? today, today);
    sources.push({
      key: "setmore",
      label: "Setmore appointments",
      kind: "appointments",
      state: stalenessToState(appointmentState(age)),
      ingest: appt.connectionActive ? "automated" : "manual_snapshot",
      dataThroughDate: appt.latestAppointmentDate,
      lastLoadedAt: appt.lastSyncAt ?? appt.lastImportAt,
      summary: `Appointment data is current through ${appt.latestAppointmentDate}.`,
      detail: appt.connectionActive
        ? null
        : "Appointments arrive by manual CSV import; there is no active Setmore connection, so currency depends on when someone last uploaded an export.",
    });
  }

  /* --------------------------------------------------- club membership */
  const club = inputs.clubMembership;
  if (club.snapshotCount === 0) {
    sources.push({
      key: "gym_management_solutions",
      label: "Club membership (GMS)",
      kind: "club_membership",
      state: "never_loaded",
      ingest: "manual_snapshot",
      dataThroughDate: null,
      lastLoadedAt: null,
      summary: "No GMS snapshot has been recorded.",
      detail:
        "Club-level denominators are entered by hand. Until a snapshot exists, PT penetration cannot be calculated and must not be estimated.",
    });
  } else {
    sources.push({
      key: "gym_management_solutions",
      label: "Club membership (GMS)",
      kind: "club_membership",
      state: stalenessToState(assessStaleness(club.latestSnapshotAsOf, today)),
      ingest: "manual_snapshot",
      dataThroughDate: club.latestSnapshotAsOf,
      lastLoadedAt: club.latestSnapshotEnteredAt,
      summary: `Latest GMS snapshot is as of ${club.latestSnapshotAsOf}.`,
      detail:
        "Manually entered aggregate values. Any figure derived from these must name the snapshot date rather than presenting them as live.",
    });
  }

  /* --------------------------------------------------------- payroll */
  const payroll = inputs.payroll;
  if (payroll.finalizedRunCount === 0) {
    sources.push({
      key: "payroll",
      label: "Payroll",
      kind: "payroll",
      state: "never_loaded",
      ingest: "automated",
      dataThroughDate: null,
      lastLoadedAt: null,
      summary: "No payroll run has been finalized.",
      detail:
        "Payroll metrics use posted or locked runs only; draft calculations are never reported.",
    });
  } else {
    sources.push({
      key: "payroll",
      label: "Payroll",
      kind: "payroll",
      state: stalenessToState(assessStaleness(payroll.latestFinalizedPeriodEnd, today)),
      ingest: "automated",
      dataThroughDate: payroll.latestFinalizedPeriodEnd,
      lastLoadedAt: payroll.latestFinalizedAt,
      summary: `Payroll is finalized through ${payroll.latestFinalizedPeriodEnd}.`,
      detail: null,
    });
  }

  /* ---------------------------------------------------------- everfit */
  // Declared, not connected. Present in the model so its absence is a
  // stated fact rather than a silent gap someone assumes is covered.
  sources.push({
    key: "everfit",
    label: "Everfit coaching",
    kind: "coaching",
    state: "not_connected",
    ingest: "not_connected",
    dataThroughDate: null,
    lastLoadedAt: null,
    summary: "Everfit is not connected.",
    detail:
      "Coaching, programming and adherence data is not available to Performance Operations. Questions about client coaching activity cannot be answered from this system.",
  });

  const withData = sources.filter(
    (s) => s.state !== "never_loaded" && s.state !== "not_connected"
  );

  return {
    asOf: today,
    sources,
    isEmpty: withData.length === 0,
    staleSources: sources.filter((s) => s.state === "stale").map((s) => s.key),
  };
}

/**
 * The sentence that must accompany any quantitative answer. Callers that
 * cannot produce one should not produce a number either.
 */
export function freshnessStatement(report: FreshnessReport, kind: SourceKind): string {
  const source = report.sources.find((s) => s.kind === kind);
  if (!source) return "The freshness of this data is unknown.";
  return source.summary;
}

/**
 * Whether it is honest to report numbers for a source. Deliberately a
 * separate, explicit call: "may I quote a number?" should never be
 * inferred from a state string at each call site.
 */
export function mayReportQuantitatively(
  report: FreshnessReport,
  kind: SourceKind
): boolean {
  const source = report.sources.find((s) => s.kind === kind);
  if (!source) return false;
  return source.state !== "never_loaded" && source.state !== "not_connected";
}
