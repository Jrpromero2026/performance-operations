import { z } from "zod";

/** Shared trainer form schema (client validation + server re-validation). */
export const trainerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: z.string().trim().min(1, "Last name is required.").max(100),
  displayName: z.string().trim().min(1, "Display name is required.").max(200),
  email: z
    .union([z.email("Enter a valid email."), z.literal("")])
    .transform((v) => (v === "" ? null : v.toLowerCase())),
  phone: z.string().trim().max(40).optional().default(""),
  employmentStatus: z.enum(["active", "on_leave", "separated"]),
  hireDate: z.union([z.iso.date(), z.literal("")]).transform((v) => v || null),
  separationDate: z
    .union([z.iso.date(), z.literal("")])
    .transform((v) => v || null),
  notes: z.string().max(4000).optional().default(""),
  setmoreId: z.string().trim().max(200).optional().default(""),
  acuityId: z.string().trim().max(200).optional().default(""),
});

export type TrainerFormValues = z.input<typeof trainerSchema>;

/** Client-side validation schema (no transforms so RHF input/output match). */
export const trainerClientSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: z.string().trim().min(1, "Last name is required.").max(100),
  displayName: z.string().trim().min(1, "Display name is required.").max(200),
  email: z.union([z.email("Enter a valid email."), z.literal("")]),
  phone: z.string().trim().max(40).optional(),
  employmentStatus: z.enum(["active", "on_leave", "separated"]),
  hireDate: z.union([z.iso.date(), z.literal("")]),
  separationDate: z.union([z.iso.date(), z.literal("")]),
  notes: z.string().max(4000).optional(),
  setmoreId: z.string().trim().max(200).optional(),
  acuityId: z.string().trim().max(200).optional(),
});

export const trainerCreateSchema = trainerSchema.extend({
  organizationId: z.uuid("Choose an organization."),
  title: z.string().trim().min(1, "Role/title is required.").max(120),
  departmentIds: z.array(z.uuid()).max(30).default([]),
  /** Set when the user has reviewed and dismissed a duplicate warning. */
  confirmDuplicate: z.boolean().default(false),
});

export function refineDates(values: {
  hireDate: string | null;
  separationDate: string | null;
}): string | null {
  if (values.hireDate && values.separationDate && values.separationDate < values.hireDate) {
    return "Separation date cannot precede hire date.";
  }
  return null;
}
