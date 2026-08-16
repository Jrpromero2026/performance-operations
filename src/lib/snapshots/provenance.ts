/**
 * Manual-data governance: the rules that keep a hand-entered figure
 * distinguishable from an automated one, forever.
 *
 * The failure this module exists to prevent is subtle and expensive: a
 * number typed in once in August quietly being reported in December as
 * though it were current. Everything derived from a manual snapshot must
 * therefore carry, and be able to state, WHERE it came from, WHEN the
 * external system was actually read, and HOW STALE that reading now is.
 *
 * Pure functions only — no I/O, no ambient clock. The caller supplies
 * "now", so staleness is testable and reports are reproducible.
 */

/** How a value reached Performance Operations. */
export type ProvenanceMode = "live_automated" | "manual_snapshot" | "derived" | "unavailable";

export interface SnapshotProvenance {
  mode: ProvenanceMode;
  /** External system key, e.g. `gym_management_solutions`. */
  sourceKey: string;
  sourceLabel: string;
  /** The date the external system was read. */
  asOfDate: string;
  /** Reporting window the reading describes. */
  periodStart: string;
  periodEnd: string;
  enteredByName: string | null;
  enteredAt: string;
  note: string | null;
}

export type Staleness = "current" | "aging" | "stale" | "unknown";

/**
 * Staleness thresholds for a MONTHLY manual cadence — the cadence the
 * owner actually intends for GMS. A reading is `current` inside the month
 * it was taken, `aging` once a second month has passed without a new one,
 * and `stale` beyond that. These are presentation thresholds only; no
 * calculation changes because of them.
 */
export const SNAPSHOT_AGING_DAYS = 45;
export const SNAPSHOT_STALE_DAYS = 75;

export function daysBetween(fromIsoDate: string, toIsoDate: string): number | null {
  const from = Date.parse(`${fromIsoDate}T00:00:00Z`);
  const to = Date.parse(`${toIsoDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

export function assessStaleness(asOfDate: string | null, todayIsoDate: string): Staleness {
  if (!asOfDate) return "unknown";
  const age = daysBetween(asOfDate, todayIsoDate);
  if (age === null) return "unknown";
  if (age >= SNAPSHOT_STALE_DAYS) return "stale";
  if (age >= SNAPSHOT_AGING_DAYS) return "aging";
  return "current";
}

/**
 * The sentence any report — or a future PT Director — must attach to a
 * number that came from a manual snapshot. Written so it can be read
 * aloud, and so it can never be mistaken for live data.
 */
export function describeProvenance(
  provenance: SnapshotProvenance,
  todayIsoDate: string
): string {
  if (provenance.mode === "unavailable") {
    return `No ${provenance.sourceLabel} snapshot has been recorded.`;
  }
  if (provenance.mode === "live_automated") {
    return `From ${provenance.sourceLabel}, synced through ${provenance.asOfDate}.`;
  }
  const staleness = assessStaleness(provenance.asOfDate, todayIsoDate);
  const age = daysBetween(provenance.asOfDate, todayIsoDate);
  const suffix =
    staleness === "stale"
      ? ` This reading is ${age} days old and may no longer reflect the club.`
      : staleness === "aging"
        ? ` This reading is ${age} days old.`
        : "";
  return `Based on the ${provenance.sourceLabel} snapshot as of ${provenance.asOfDate}${
    provenance.enteredByName ? `, entered by ${provenance.enteredByName}` : ""
  }.${suffix}`;
}

/**
 * Guard against the single most dangerous mistake in this domain:
 * presenting manual data as automated. Any surface that renders a value
 * must be able to answer "is this live?" and this is the one answer.
 */
export function isAutomated(provenance: SnapshotProvenance): boolean {
  return provenance.mode === "live_automated";
}
