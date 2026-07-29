import { z } from "zod";

export const serviceFlagKeys = [
  "countsAsSession",
  "countsAsCoachingHours",
  "payrollEligible",
  "revenueEligible",
  "isEvaluation",
  "isTeamTraining",
  "isNutrition",
  "isGroupTraining",
] as const;

export const serviceSchema = z.object({
  organizationId: z.uuid("Choose an organization."),
  categoryId: z.uuid("Choose a category."),
  internalName: z.string().trim().min(1, "Internal name is required.").max(200),
  displayName: z.string().trim().min(1, "Display name is required.").max(200),
  description: z.string().max(2000).optional().default(""),
  defaultDurationMinutes: z.coerce
    .number()
    .int("Duration must be whole minutes.")
    .min(1, "Duration must be at least 1 minute.")
    .max(1440, "Duration cannot exceed 24 hours."),
  status: z.enum(["active", "inactive"]),
  effectiveFrom: z.iso.date("Enter an effective start date."),
  effectiveTo: z
    .union([z.iso.date(), z.literal("")])
    .transform((v) => v || null),
  departmentIds: z.array(z.uuid()).max(30).default([]),
  countsAsSession: z.boolean(),
  countsAsCoachingHours: z.boolean(),
  payrollEligible: z.boolean(),
  revenueEligible: z.boolean(),
  isEvaluation: z.boolean(),
  isTeamTraining: z.boolean(),
  isNutrition: z.boolean(),
  isGroupTraining: z.boolean(),
});

export const aliasSchema = z.object({
  serviceId: z.uuid(),
  source: z.enum(["setmore", "acuity", "manual_csv"]),
  alias: z.string().trim().min(1, "Alias text is required.").max(300),
});
