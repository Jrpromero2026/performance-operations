/**
 * Period-close state machine — TS mirror of the database trigger
 * (app.period_close_transition_guard). The DATABASE is authoritative;
 * this mirror exists for friendly errors and unit tests.
 */

export const CLOSE_STATUSES = [
  "close_review",
  "ready_to_close",
  "closing",
  "closed",
  "superseded",
  "voided",
] as const;

export type CloseStatus = (typeof CLOSE_STATUSES)[number];

const TRANSITIONS: Record<CloseStatus, readonly CloseStatus[]> = {
  close_review: ["ready_to_close", "voided"],
  ready_to_close: ["close_review", "closing", "voided"],
  closing: ["closed", "ready_to_close"],
  closed: ["superseded"],
  superseded: [],
  voided: [],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = TRANSITIONS[from as CloseStatus];
  return allowed !== undefined && (allowed as readonly string[]).includes(to);
}

/** Statuses in which the close run is still being worked. */
export function isMutable(status: string): boolean {
  return status === "close_review" || status === "ready_to_close";
}

/** Human labels for the wizard. */
export const CLOSE_STATUS_LABEL: Record<CloseStatus, string> = {
  close_review: "In review",
  ready_to_close: "Ready to close",
  closing: "Closing",
  closed: "Closed",
  superseded: "Superseded",
  voided: "Voided",
};
