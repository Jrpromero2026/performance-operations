/**
 * Structured eligibility evaluation for compensation rules.
 *
 * Rule criteria are stored as JSON on compensation_rules.criteria:
 *
 *   { "conditions": [
 *       { "field": "canonical_status", "op": "in", "value": ["completed"] },
 *       { "field": "duration_minutes", "op": "gte", "value": 30 }
 *   ] }
 *
 * All conditions must pass (AND). The evaluator FAILS CLOSED: malformed
 * criteria, unknown fields, unknown operators, or type mismatches never
 * silently pass — they block the line so a human resolves the rule.
 */

export const ELIGIBILITY_FIELDS = [
  "canonical_status",
  "service_id",
  "department_id",
  "duration_minutes",
  "participant_count",
  "payment_status",
] as const;

export type EligibilityField = (typeof ELIGIBILITY_FIELDS)[number];

export const ELIGIBILITY_OPS = [
  "eq",
  "neq",
  "in",
  "not_in",
  "gte",
  "lte",
] as const;

export type EligibilityOp = (typeof ELIGIBILITY_OPS)[number];

export interface EligibilityContext {
  canonical_status: string;
  service_id: string;
  department_id: string | null;
  duration_minutes: number;
  participant_count: number;
  payment_status: string | null;
}

export type EligibilityResult =
  | { result: "eligible" }
  | { result: "ineligible"; reason: string }
  | { result: "blocked"; reason: string };

interface ParsedCondition {
  field: EligibilityField;
  op: EligibilityOp;
  value: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse raw criteria JSON. Returns the condition list or an error string.
 * `{}` and `{ "conditions": [] }` parse to an empty list — whether an empty
 * list is acceptable is the caller's (method-specific) decision.
 */
export function parseCriteria(
  raw: unknown,
): { conditions: ParsedCondition[] } | { error: string } {
  if (raw === null || raw === undefined) return { conditions: [] };
  if (!isRecord(raw)) return { error: "criteria must be a JSON object" };

  const keys = Object.keys(raw);
  if (keys.length === 0) return { conditions: [] };
  if (keys.some((k) => k !== "conditions")) {
    return { error: `criteria has unsupported keys: ${keys.join(", ")}` };
  }
  if (!Array.isArray(raw.conditions)) {
    return { error: "criteria.conditions must be an array" };
  }

  const conditions: ParsedCondition[] = [];
  for (const [index, entry] of raw.conditions.entries()) {
    if (!isRecord(entry)) {
      return { error: `condition ${index} must be an object` };
    }
    const { field, op, value } = entry;
    if (
      typeof field !== "string" ||
      !(ELIGIBILITY_FIELDS as readonly string[]).includes(field)
    ) {
      return { error: `condition ${index} has unknown field: ${String(field)}` };
    }
    if (
      typeof op !== "string" ||
      !(ELIGIBILITY_OPS as readonly string[]).includes(op)
    ) {
      return { error: `condition ${index} has unknown operator: ${String(op)}` };
    }
    conditions.push({
      field: field as EligibilityField,
      op: op as EligibilityOp,
      value,
    });
  }
  return { conditions };
}

const NUMERIC_FIELDS: readonly EligibilityField[] = [
  "duration_minutes",
  "participant_count",
];

function evaluateCondition(
  condition: ParsedCondition,
  context: EligibilityContext,
): { pass: boolean } | { blocked: string } {
  const actual = context[condition.field];
  const numeric = NUMERIC_FIELDS.includes(condition.field);

  switch (condition.op) {
    case "eq":
    case "neq": {
      if (numeric && typeof condition.value !== "number") {
        return { blocked: `${condition.field} ${condition.op} needs a number` };
      }
      if (!numeric && typeof condition.value !== "string") {
        return { blocked: `${condition.field} ${condition.op} needs a string` };
      }
      const equal = actual === condition.value;
      return { pass: condition.op === "eq" ? equal : !equal };
    }
    case "in":
    case "not_in": {
      if (
        !Array.isArray(condition.value) ||
        condition.value.length === 0 ||
        condition.value.some((v) =>
          numeric ? typeof v !== "number" : typeof v !== "string",
        )
      ) {
        return {
          blocked: `${condition.field} ${condition.op} needs a non-empty array`,
        };
      }
      const contains = condition.value.includes(actual as never);
      return { pass: condition.op === "in" ? contains : !contains };
    }
    case "gte":
    case "lte": {
      if (!numeric) {
        return {
          blocked: `${condition.op} only applies to numeric fields, not ${condition.field}`,
        };
      }
      if (typeof condition.value !== "number" || typeof actual !== "number") {
        return { blocked: `${condition.field} ${condition.op} needs a number` };
      }
      return {
        pass: condition.op === "gte"
          ? actual >= condition.value
          : actual <= condition.value,
      };
    }
  }
}

/** Evaluate criteria against an appointment context. Fails closed. */
export function evaluateEligibility(
  rawCriteria: unknown,
  context: EligibilityContext,
): EligibilityResult {
  const parsed = parseCriteria(rawCriteria);
  if ("error" in parsed) {
    return { result: "blocked", reason: `criteria_malformed: ${parsed.error}` };
  }
  for (const condition of parsed.conditions) {
    const outcome = evaluateCondition(condition, context);
    if ("blocked" in outcome) {
      return {
        result: "blocked",
        reason: `criteria_malformed: ${outcome.blocked}`,
      };
    }
    if (!outcome.pass) {
      return {
        result: "ineligible",
        reason: `${condition.field} ${condition.op} ${JSON.stringify(condition.value)}`,
      };
    }
  }
  return { result: "eligible" };
}

/**
 * Does the criteria explicitly constrain canonical_status? Revenue-based
 * rules must state eligible statuses (fail-closed policy from
 * docs/business-rules/payroll-rule-gaps.md — unresolved cancellation and
 * no-show pay must never be paid implicitly).
 */
export function criteriaConstrainsStatus(rawCriteria: unknown): boolean {
  const parsed = parseCriteria(rawCriteria);
  if ("error" in parsed) return false;
  return parsed.conditions.some(
    (c) =>
      c.field === "canonical_status" && (c.op === "eq" || c.op === "in"),
  );
}
