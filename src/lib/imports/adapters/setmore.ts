import {
  normalizeSetmoreRecord,
  type SetmoreNormalizeContext,
} from "@/lib/sources/setmore/canonical";
import {
  SETMORE_CSV_OPTIONAL_HEADERS,
  SETMORE_CSV_REQUIRED_HEADERS,
  setmoreCsvRowToCanonical,
  unrecognizedCsvColumns,
} from "@/lib/sources/setmore/csv-fields";
import type { AdapterContext, NormalizeResult, SourceAdapter } from "../types";

/**
 * Setmore report adapter, version setmore-v1.
 *
 * This module is now only a TRANSPORT: it detects the export's header
 * shape and hands the row to the canonical Setmore normalizer, which is
 * shared with the Setmore API adapter. Business rules (timing, money,
 * status, identity) deliberately do not live here — see
 * `src/lib/sources/setmore/canonical.ts`.
 */

const REQUIRED = [...SETMORE_CSV_REQUIRED_HEADERS];
const OPTIONAL = [...SETMORE_CSV_OPTIONAL_HEADERS];

export const setmoreAdapter: SourceAdapter = {
  source: "setmore",
  version: "setmore-v1",
  displayName: "Setmore report (v1)",
  requiredHeaders: REQUIRED,
  optionalHeaders: OPTIONAL,

  detect(headers: string[]): number {
    const set = new Set(headers.map((h) => h.trim()));
    const requiredHits = REQUIRED.filter((h) => set.has(h)).length;
    if (requiredHits < REQUIRED.length) return 0;
    const optionalHits = OPTIONAL.filter((h) => set.has(h)).length;
    return Math.min(1, 0.8 + optionalHits / (OPTIONAL.length * 5));
  },

  normalizeRow(row: Record<string, string>, ctx: AdapterContext): NormalizeResult {
    const result = normalizeSetmoreRecord(
      setmoreCsvRowToCanonical(row),
      ctx as SetmoreNormalizeContext
    );

    const unrecognized = unrecognizedCsvColumns(row);
    if (unrecognized.length > 0) {
      result.issues.push({
        code: "unrecognized_columns",
        severity: "warning",
        message: `Unrecognized column(s) preserved: ${unrecognized.join(", ")}.`,
      });
    }

    return result;
  },
};
