/**
 * Schema-drift detection — compares a provider record against the
 * adapter's expected field contract. Drift never silently discards
 * data: the sync engine marks the connection degraded, blocks the
 * affected flow, preserves the raw evidence, and requires adapter
 * review before incompatible structures are accepted.
 */

export interface FieldExpectation {
  name: string;
  required: boolean;
  /** typeof-style expectation; 'any' skips type checking. */
  type: "string" | "number" | "boolean" | "object" | "any";
}

export interface DriftReport {
  hasDrift: boolean;
  missingRequired: string[];
  newFields: string[];
  typeChanges: { field: string; expected: string; actual: string }[];
}

export function detectDrift(
  payload: Record<string, unknown>,
  expectations: FieldExpectation[],
): DriftReport {
  const expectedNames = new Set(expectations.map((e) => e.name));
  const missingRequired: string[] = [];
  const typeChanges: DriftReport["typeChanges"] = [];

  for (const expectation of expectations) {
    const value = payload[expectation.name];
    if (value === undefined || value === null) {
      if (expectation.required) missingRequired.push(expectation.name);
      continue;
    }
    if (expectation.type !== "any" && typeof value !== expectation.type) {
      typeChanges.push({
        field: expectation.name,
        expected: expectation.type,
        actual: typeof value,
      });
    }
  }

  const newFields = Object.keys(payload).filter((k) => !expectedNames.has(k)).sort();

  return {
    hasDrift: missingRequired.length > 0 || typeChanges.length > 0,
    missingRequired,
    newFields,
    typeChanges,
  };
}

/** Aggregate per-record reports into a run-level summary. */
export function summarizeDrift(reports: DriftReport[]): DriftReport {
  const missing = new Set<string>();
  const added = new Set<string>();
  const changes = new Map<string, DriftReport["typeChanges"][number]>();
  for (const report of reports) {
    report.missingRequired.forEach((f) => missing.add(f));
    report.newFields.forEach((f) => added.add(f));
    report.typeChanges.forEach((c) => changes.set(c.field, c));
  }
  return {
    hasDrift: missing.size > 0 || changes.size > 0,
    missingRequired: [...missing].sort(),
    newFields: [...added].sort(),
    typeChanges: [...changes.values()],
  };
}
