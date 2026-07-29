/** Compensation method and rule catalogs (mirror the DB check constraints). */

export const COMPENSATION_METHODS = [
  "revenue_commission",
  "flat_per_session",
  "hourly",
  "percentage_of_revenue",
  "team_training_rate",
  "head_coach_rate",
  "assistant_coach_rate",
  "evaluation_bonus",
  "package_sale_commission",
  "nutrition_client_rate",
  "admin_hourly",
  "manual_bonus",
  "manual_deduction",
] as const;

export type CompensationMethod = (typeof COMPENSATION_METHODS)[number];

export const RULE_TYPES = [
  "session_rate",
  "hourly_rate",
  "revenue_rate",
  "team_training_rate",
  "head_coach_rate",
  "assistant_coach_rate",
  "evaluation_bonus",
  "package_sale_rate",
  "nutrition_client_rate",
  "admin_hourly_rate",
  "manual_bonus",
  "manual_deduction",
] as const;

export type RuleType = (typeof RULE_TYPES)[number];

export const ASSIGNMENT_PURPOSES = [
  "primary",
  "team_training",
  "evaluations",
  "nutrition",
  "administrative",
] as const;

export function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}
