/**
 * PT penetration — the one calculation a GMS snapshot actually unlocks.
 *
 * Read this before adding anything else here. Performance Operations
 * already has TWO utilization metrics, and this is not a third meaning of
 * the same word:
 *
 *   schedule_utilization_bp  — completed minutes ÷ booked minutes.
 *                              "Did the booked work happen?"
 *   capacity_utilization_bp  — coached minutes ÷ configured availability.
 *                              "How full is a trainer's day?"  (reports
 *                              configuration_missing; capacity is not
 *                              configured anywhere.)
 *   pt_penetration_bp        — active PT clients ÷ eligible club members.
 *                              "How much of the club buys training?"
 *
 * They answer different questions and must never be collapsed or quoted
 * as plain "utilization". The first two are computed entirely from the
 * appointment ledger. Only this third one needs an external denominator,
 * and that denominator is exactly why the GMS snapshot model exists.
 *
 * The denominator is NOT invented. `club_pt_eligible_members` is an
 * owner-defined population; if the owner has not defined it, this returns
 * `configuration_missing` rather than silently substituting total active
 * members — a substitution that would understate penetration and, worse,
 * would look like a real number.
 */

import { assessStaleness, type SnapshotProvenance, type Staleness } from "./provenance";

/** Mirrors the intelligence layer's health vocabulary. */
export type PenetrationHealth = "healthy" | "configuration_missing" | "insufficient_data";

export interface PenetrationInput {
  /** From the catalog metric `active_clients` (distinct completed-appointment clients). */
  activePtClients: number | null;
  /** From the latest GMS snapshot. Null when never entered. */
  eligibleMembers: number | null;
  /** Total active members — context only; never a denominator fallback. */
  totalActiveMembers?: number | null;
  provenance: SnapshotProvenance | null;
  todayIsoDate: string;
}

export interface PenetrationResult {
  /** Basis points, matching every other rate in the platform. */
  valueBp: number | null;
  health: PenetrationHealth;
  reasons: string[];
  /** Never omitted from a report: this number is only as fresh as its snapshot. */
  denominatorStaleness: Staleness;
  numerator: number | null;
  denominator: number | null;
}

/**
 * Basis-point ratio with integer arithmetic, matching `ratioBp` in the
 * intelligence layer so a penetration figure rounds identically to every
 * other rate the platform reports.
 */
function ratioBp(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10_000);
}

export function calculatePtPenetration(input: PenetrationInput): PenetrationResult {
  const reasons: string[] = [];
  const staleness = assessStaleness(input.provenance?.asOfDate ?? null, input.todayIsoDate);

  if (input.eligibleMembers === null || input.provenance === null) {
    reasons.push(
      "No GMS snapshot has recorded PT-eligible members, so there is no denominator. Total active members is NOT substituted — eligibility is an owner-defined population and guessing it would invent a business rule."
    );
    return {
      valueBp: null,
      health: "configuration_missing",
      reasons,
      denominatorStaleness: staleness,
      numerator: input.activePtClients,
      denominator: null,
    };
  }

  if (input.activePtClients === null) {
    reasons.push(
      "Active PT clients could not be computed for this window — no appointment data has been posted."
    );
    return {
      valueBp: null,
      health: "insufficient_data",
      reasons,
      denominatorStaleness: staleness,
      numerator: null,
      denominator: input.eligibleMembers,
    };
  }

  if (input.eligibleMembers <= 0) {
    reasons.push("The recorded PT-eligible member count is zero; a ratio cannot be formed.");
    return {
      valueBp: null,
      health: "insufficient_data",
      reasons,
      denominatorStaleness: staleness,
      numerator: input.activePtClients,
      denominator: input.eligibleMembers,
    };
  }

  if (input.activePtClients > input.eligibleMembers) {
    // Not an error — PT clients need not all be members — but reporting
    // >100% penetration without saying why would look like a bug.
    reasons.push(
      "Active PT clients exceed the recorded eligible member population; some PT clients may not be club members, or the snapshot may be out of date."
    );
  }
  if (staleness === "stale") {
    reasons.push(
      `The denominator comes from a snapshot dated ${input.provenance.asOfDate} and is no longer current.`
    );
  }

  return {
    valueBp: ratioBp(input.activePtClients, input.eligibleMembers),
    health: "healthy",
    reasons,
    denominatorStaleness: staleness,
    numerator: input.activePtClients,
    denominator: input.eligibleMembers,
  };
}

/** Basis points → a display string. 1234 → "12.34%". */
export function formatBp(valueBp: number | null): string {
  if (valueBp === null) return "—";
  return `${(valueBp / 100).toFixed(2)}%`;
}
