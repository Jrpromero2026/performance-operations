/**
 * Payroll calculation engine types. The engine is pure: it receives plain
 * inputs (already loaded from the canonical ledger + configuration), returns
 * lines/issues/totals, and never touches the database. The action layer maps
 * DB rows to these shapes and persists the result.
 */

import type { CompensationMethod, RuleType } from "@/lib/schemas/compensation";
import type { RoundingMethod, RoundingScope } from "./rounding";

export const CALCULATION_VERSION = "calc-v1";

/* ----------------------------------------------------------------- inputs */

export const ASSIGNMENT_ROLES = [
  "primary",
  "head_coach",
  "assistant_coach",
  "support_coach",
  "observer",
  "non_compensated",
] as const;

export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];

/** A compensated trainer participation on one appointment. */
export interface EngineParticipation {
  /** appointment_trainer_assignments.id when explicit; null for the ledger's primary trainer. */
  assignmentId: string | null;
  trainerId: string;
  role: AssignmentRole;
  /** Overrides the appointment duration for this participant when set. */
  compensatedMinutes: number | null;
}

export interface EngineAppointment {
  id: string;
  serviceId: string;
  departmentId: string | null;
  canonicalStatus: string;
  startAt: string; // ISO timestamp, used only for deterministic ordering
  durationMinutes: number;
  participantCount: number;
  listedAmountCents: number | null;
  paidAmountCents: number | null;
  paymentStatus: string | null;
  participations: EngineParticipation[];
}

export interface EngineRule {
  id: string;
  ruleType: RuleType;
  amountCents: number | null;
  rateBasisPoints: number | null;
  basisType: string | null; // 'source_listed_amount' | 'source_paid_amount' | ...
  criteria: unknown; // validated by eligibility.ts at evaluation time
}

export interface EngineTier {
  id: string;
  sequence: number;
  minRevenueCents: number;
  maxRevenueCents: number | null;
  rateBasisPoints: number;
}

export interface EnginePlanVersion {
  id: string;
  planName: string;
  method: CompensationMethod;
  tierBehavior: "cliff" | "marginal" | "not_applicable";
  roundingScope: RoundingScope | null; // null = unresolved (blocks % methods)
  rules: EngineRule[];
  tiers: EngineTier[];
}

export type AssignmentPurpose =
  | "primary"
  | "team_training"
  | "evaluations"
  | "nutrition"
  | "administrative";

export interface EnginePlanAssignment {
  trainerId: string;
  purpose: AssignmentPurpose;
  assignmentId: string;
  planVersion: EnginePlanVersion;
}

export interface EngineTimeEntry {
  id: string;
  trainerId: string;
  workDate: string;
  workCategory: string;
  approvedMinutes: number;
  compensationPurpose: AssignmentPurpose;
}

export interface EngineAdjustment {
  id: string;
  trainerId: string;
  adjustmentType:
    | "bonus"
    | "deduction"
    | "correction"
    | "reimbursement"
    | "carry_forward"
    | "other";
  amountCents: number; // always >= 0; sign comes from the type
  reason: string;
}

export interface EngineInput {
  organizationId: string;
  payrollRunId: string;
  appointments: EngineAppointment[];
  planAssignments: EnginePlanAssignment[];
  timeEntries: EngineTimeEntry[];
  adjustments: EngineAdjustment[];
  /** Trainers in scope even without appointments (e.g. time-entry only). */
  trainerIds: string[];
}

/* ---------------------------------------------------------------- outputs */

export type LineType =
  | "session_flat"
  | "session_percentage"
  | "commission_tier"
  | "hourly"
  | "team_role"
  | "evaluation_bonus"
  | "manual_time"
  | "adjustment"
  | "carry_forward";

export type LineStatus = "calculated" | "blocked" | "excluded";

export interface EngineLine {
  lineType: LineType;
  calculationStatus: LineStatus;
  trainerId: string;
  appointmentId: string | null;
  appointmentAssignmentId: string | null;
  manualTimeEntryId: string | null;
  payrollAdjustmentId: string | null;
  planVersionId: string | null;
  ruleId: string | null;
  inputQuantity: number | null;
  inputUnit: string | null;
  basisAmountCents: number | null;
  rateAmountCents: number | null;
  rateBasisPoints: number | null;
  calculatedAmountCents: number;
  roundedAmountCents: number;
  roundingMethod: RoundingMethod;
  eligibilityResult: "eligible" | "ineligible" | "blocked";
  exclusionReason: string | null;
  /** Human-readable, step-by-step derivation. JSON-serializable. */
  trace: CalculationTrace;
}

export interface TraceStep {
  step: string;
  detail: string;
  values?: Record<string, string | number | boolean | null>;
}

export interface CalculationTrace {
  version: typeof CALCULATION_VERSION;
  method: string;
  steps: TraceStep[];
}

export type IssueSeverity = "blocking" | "warning" | "info";

export interface EngineIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  suggestedAction: string | null;
  trainerId: string | null;
  appointmentId: string | null;
  ruleId: string | null;
  entityType: string | null;
  entityId: string | null;
}

export interface TrainerTotals {
  appointmentCount: number;
  completedSessionCount: number;
  compensatedMinutes: number;
  eligibleBasisTotalCents: number;
  commissionCents: number;
  flatRateCents: number;
  hourlyCents: number;
  teamCents: number;
  bonusCents: number;
  deductionCents: number;
  adjustmentCents: number;
  finalGrossCents: number;
}

export interface EngineTrainerResult {
  trainerId: string;
  planVersionId: string | null;
  planAssignmentId: string | null;
  calculationStatus: "calculated" | "blocked";
  lines: EngineLine[];
  totals: TrainerTotals;
  blockingIssueCount: number;
  warningCount: number;
}

export interface EngineResult {
  calculationVersion: typeof CALCULATION_VERSION;
  trainers: EngineTrainerResult[];
  issues: EngineIssue[];
  runTotals: {
    grossCompensationCents: number;
    adjustmentCents: number;
    finalCompensationCents: number;
    trainerCount: number;
    appointmentCount: number;
    blockingIssueCount: number;
    warningCount: number;
  };
}
