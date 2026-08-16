/**
 * Deterministic Setmore API ↔ CSV reconciliation.
 *
 * Phase F recorded a specific, well-founded worry: the Setmore API may
 * not expose the status semantics the CSV export carries. This module
 * exists to SETTLE that question with evidence rather than assumption.
 * It takes the same period from both sources, aligns occurrences, and
 * reports what actually differs.
 *
 * Everything here is pure — no I/O, no clock, no database. Given the two
 * record sets, the output is identical every time, which is what makes
 * it usable as an acceptance gate for turning the API on.
 *
 * Verdicts:
 *   MATCH     — aligned, and every comparable field agrees
 *   MISMATCH  — aligned, but at least one comparable field differs
 *   API_ONLY  — present in the API window, absent from the CSV export
 *   CSV_ONLY  — present in the CSV export, absent from the API window
 *
 * A field the API structurally cannot provide (status is the live case)
 * is NOT a mismatch. Counting it as one would drown the real differences
 * in noise and, worse, would imply the two sources disagree when in fact
 * one is simply silent. Those fields get their own verdict —
 * `unavailable_in_api` — and their own line in the summary, because
 * "the API cannot tell us this" is the single most important thing the
 * owner needs to know before trusting API-sourced data.
 */

import type { NormalizedRow } from "@/lib/imports/types";
import { normalizeText } from "@/lib/imports/values";

export type ReconciliationVerdict = "match" | "mismatch" | "api_only" | "csv_only";

export type FieldVerdict = "equal" | "different" | "unavailable_in_api" | "absent_in_both";

/** One record entering reconciliation, with its origin. */
export interface ReconciliationInput {
  /** Stable handle for reporting (import row id, API appointment key, …). */
  reference: string;
  row: NormalizedRow;
}

export interface FieldComparison {
  field: string;
  verdict: FieldVerdict;
  apiValue: string | null;
  csvValue: string | null;
}

export interface ReconciliationEntry {
  /** (external id + start instant) — Setmore occurrence identity. */
  occurrenceKey: string;
  verdict: ReconciliationVerdict;
  apiReference: string | null;
  csvReference: string | null;
  fields: FieldComparison[];
  /** Fields that differ, for compact reporting. */
  differingFields: string[];
}

export interface ReconciliationSummary {
  match: number;
  mismatch: number;
  apiOnly: number;
  csvOnly: number;
  /** Aligned pairs whose status the API could not supply. */
  statusUnverifiable: number;
  /** Occurrence keys that appeared more than once within one source. */
  ambiguousKeys: string[];
  /** Records skipped because they had no usable occurrence identity. */
  unkeyedApi: number;
  unkeyedCsv: number;
  differingFieldCounts: Record<string, number>;
}

export interface ReconciliationReport {
  entries: ReconciliationEntry[];
  summary: ReconciliationSummary;
}

/**
 * Occurrence identity. Setmore Booking IDs identify a recurring SERIES
 * (established from real exports in Phase 3), so the external id alone
 * cannot key an occurrence — the start instant completes it.
 */
export function occurrenceKeyFor(row: NormalizedRow): string | null {
  if (!row.startAt) return null;
  const external = row.externalAppointmentId
    ? normalizeText(row.externalAppointmentId)
    : "";
  return external === "" ? null : `${external}|${row.startAt}`;
}

/* ---------------------------------------------------------- comparators */

type Extractor = (row: NormalizedRow) => string | null;

const text: (get: (row: NormalizedRow) => string | undefined) => Extractor =
  (get) => (row) => {
    const value = get(row);
    return value === undefined || value.trim() === "" ? null : normalizeText(value);
  };

const raw: (get: (row: NormalizedRow) => string | number | undefined) => Extractor =
  (get) => (row) => {
    const value = get(row);
    return value === undefined ? null : String(value);
  };

interface FieldSpec {
  field: string;
  extract: Extractor;
  /**
   * True when the API structurally cannot carry this field. Set from the
   * documented contract, not from an empty value in one sample — an
   * absent value could just mean "this appointment had none".
   */
  unavailableInApi?: boolean;
}

/**
 * Fields compared, in report order. Trainer and service are compared by
 * the SOURCE name because reconciliation runs before internal matching —
 * the point is to test the two sources against each other, not against
 * our mapping tables.
 */
export const RECONCILIATION_FIELDS: FieldSpec[] = [
  { field: "start_at", extract: raw((r) => r.startAt) },
  { field: "end_at", extract: raw((r) => r.endAt) },
  { field: "duration_minutes", extract: raw((r) => r.durationMinutes) },
  { field: "external_appointment_id", extract: text((r) => r.externalAppointmentId) },
  { field: "trainer", extract: text((r) => r.sourceTrainerName) },
  { field: "service", extract: text((r) => r.sourceServiceName) },
  { field: "client_name", extract: text((r) => r.sourceClientName) },
  { field: "client_email", extract: text((r) => r.sourceClientEmail) },
  { field: "listed_price_cents", extract: raw((r) => r.listedPriceCents) },
  { field: "status", extract: text((r) => r.sourceStatus), unavailableInApi: true },
];

function compareField(
  spec: FieldSpec,
  apiRow: NormalizedRow,
  csvRow: NormalizedRow
): FieldComparison {
  const apiValue = spec.extract(apiRow);
  const csvValue = spec.extract(csvRow);

  if (spec.unavailableInApi && apiValue === null) {
    return { field: spec.field, verdict: "unavailable_in_api", apiValue, csvValue };
  }
  if (apiValue === null && csvValue === null) {
    return { field: spec.field, verdict: "absent_in_both", apiValue, csvValue };
  }
  return {
    field: spec.field,
    verdict: apiValue === csvValue ? "equal" : "different",
    apiValue,
    csvValue,
  };
}

/* -------------------------------------------------------------- indexing */

interface IndexResult {
  byKey: Map<string, ReconciliationInput>;
  ambiguous: Set<string>;
  unkeyed: number;
}

function index(inputs: ReconciliationInput[]): IndexResult {
  const byKey = new Map<string, ReconciliationInput>();
  const ambiguous = new Set<string>();
  let unkeyed = 0;
  for (const input of inputs) {
    const key = occurrenceKeyFor(input.row);
    if (key === null) {
      unkeyed++;
      continue;
    }
    if (byKey.has(key)) {
      // Two records with one occurrence identity inside a single source
      // means identity itself is wrong — the recurring-series question
      // Phase F flagged. Surfaced, never silently de-duplicated.
      ambiguous.add(key);
      continue;
    }
    byKey.set(key, input);
  }
  return { byKey, ambiguous, unkeyed };
}

/* ---------------------------------------------------------- reconcile */

/**
 * Compare one period fetched from the API against the CSV export for the
 * same period. Entries are returned in occurrence-key order so two runs
 * over the same data produce byte-identical reports.
 */
export function reconcileSetmoreSources(args: {
  api: ReconciliationInput[];
  csv: ReconciliationInput[];
}): ReconciliationReport {
  const apiIndex = index(args.api);
  const csvIndex = index(args.csv);

  const allKeys = [
    ...new Set([...apiIndex.byKey.keys(), ...csvIndex.byKey.keys()]),
  ].sort();

  const entries: ReconciliationEntry[] = [];
  const differingFieldCounts: Record<string, number> = {};
  let match = 0;
  let mismatch = 0;
  let apiOnly = 0;
  let csvOnly = 0;
  let statusUnverifiable = 0;

  for (const key of allKeys) {
    const apiInput = apiIndex.byKey.get(key) ?? null;
    const csvInput = csvIndex.byKey.get(key) ?? null;

    if (apiInput && !csvInput) {
      apiOnly++;
      entries.push({
        occurrenceKey: key,
        verdict: "api_only",
        apiReference: apiInput.reference,
        csvReference: null,
        fields: [],
        differingFields: [],
      });
      continue;
    }
    if (!apiInput && csvInput) {
      csvOnly++;
      entries.push({
        occurrenceKey: key,
        verdict: "csv_only",
        apiReference: null,
        csvReference: csvInput.reference,
        fields: [],
        differingFields: [],
      });
      continue;
    }
    if (!apiInput || !csvInput) continue;

    const fields = RECONCILIATION_FIELDS.map((spec) =>
      compareField(spec, apiInput.row, csvInput.row)
    );
    const differingFields = fields
      .filter((f) => f.verdict === "different")
      .map((f) => f.field);
    for (const field of differingFields) {
      differingFieldCounts[field] = (differingFieldCounts[field] ?? 0) + 1;
    }
    if (fields.some((f) => f.field === "status" && f.verdict === "unavailable_in_api")) {
      statusUnverifiable++;
    }

    const verdict: ReconciliationVerdict = differingFields.length === 0 ? "match" : "mismatch";
    if (verdict === "match") match++;
    else mismatch++;

    entries.push({
      occurrenceKey: key,
      verdict,
      apiReference: apiInput.reference,
      csvReference: csvInput.reference,
      fields,
      differingFields,
    });
  }

  return {
    entries,
    summary: {
      match,
      mismatch,
      apiOnly,
      csvOnly,
      statusUnverifiable,
      ambiguousKeys: [...new Set([...apiIndex.ambiguous, ...csvIndex.ambiguous])].sort(),
      unkeyedApi: apiIndex.unkeyed,
      unkeyedCsv: csvIndex.unkeyed,
      differingFieldCounts,
    },
  };
}

/**
 * Whether this reconciliation supports turning the API on as the primary
 * appointment source. Deliberately conservative and explicit: the caller
 * gets reasons, not a bare boolean, so a "no" is actionable.
 */
export function assessApiReadiness(report: ReconciliationReport): {
  apiCanReplaceCsv: boolean;
  hybridRequired: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const { summary } = report;

  if (summary.statusUnverifiable > 0) {
    reasons.push(
      `Status is unavailable from the API for ${summary.statusUnverifiable} aligned appointment(s); CSV remains the only status evidence.`
    );
  }
  if (summary.csvOnly > 0) {
    reasons.push(
      `${summary.csvOnly} appointment(s) appear only in the CSV export — the API window is incomplete for this period.`
    );
  }
  if (summary.apiOnly > 0) {
    reasons.push(
      `${summary.apiOnly} appointment(s) appear only in the API — the export may omit records the API returns (e.g. cancellations).`
    );
  }
  if (summary.mismatch > 0) {
    reasons.push(
      `${summary.mismatch} aligned appointment(s) disagree on: ${Object.keys(summary.differingFieldCounts).sort().join(", ")}.`
    );
  }
  if (summary.ambiguousKeys.length > 0) {
    reasons.push(
      `${summary.ambiguousKeys.length} occurrence key(s) are not unique within a single source — occurrence identity is unresolved.`
    );
  }
  if (summary.match === 0 && summary.mismatch === 0) {
    reasons.push("No appointments aligned between the two sources; nothing was verified.");
  }

  const hybridRequired = summary.statusUnverifiable > 0;
  const apiCanReplaceCsv = reasons.length === 0;
  return { apiCanReplaceCsv, hybridRequired, reasons };
}
