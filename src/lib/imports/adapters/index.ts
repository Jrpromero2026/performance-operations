import { createHash } from "node:crypto";
import { setmoreAdapter } from "./setmore";
import type { SourceAdapter } from "../types";

/**
 * Adapter registry. Acuity is deliberately ABSENT: no sample export exists,
 * so no schema was invented (docs/schemas/acuity-observed-schema.md).
 * Acuity CSVs import via the generic mapping adapter until unblocked.
 */
export const REGISTERED_ADAPTERS: SourceAdapter[] = [setmoreAdapter];

export interface AdapterDetection {
  adapter: SourceAdapter | null;
  confidence: number;
}

export function detectAdapter(headers: string[]): AdapterDetection {
  let best: SourceAdapter | null = null;
  let bestConfidence = 0;
  for (const adapter of REGISTERED_ADAPTERS) {
    const confidence = adapter.detect(headers);
    if (confidence > bestConfidence) {
      best = adapter;
      bestConfidence = confidence;
    }
  }
  return { adapter: bestConfidence >= 0.8 ? best : null, confidence: bestConfidence };
}

/** Stable signature of a header list (order-sensitive, trimmed, lowercased). */
export function headerSignature(headers: string[]): string {
  const canonical = JSON.stringify(headers.map((h) => h.trim().toLowerCase()));
  return createHash("sha256").update(canonical).digest("hex");
}

/** Columns that look like they carry personal data (surfaced at inspection). */
export function detectSensitiveColumns(headers: string[]): string[] {
  return headers
    .map((h) => h.trim())
    .filter((h) =>
      /email|phone|mobile|address|zip|postal|birth|dob|ssn|health|medical|note|comment/i.test(h)
    );
}
