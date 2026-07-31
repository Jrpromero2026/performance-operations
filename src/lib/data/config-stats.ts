import type { ActorContext } from "@/lib/actions/shared";

/** Per-organization configuration statistics for the hub and overview. */
export interface OrgConfigStats {
  organizationId: string;
  organizationName: string;
  departments: number;
  members: number;
  admins: number;
  pendingInvitations: number;
  activeTrainers: number;
  trainersWithCompensation: number;
  activeServices: number;
  servicesWithAliases: number;
  reportingPeriods: number;
  openPeriods: number;
  compensationPlans: number;
  publishedVersions: number;
  /** Scheduling exports uploaded (any state), and those posted. */
  importBatches: number;
  postedImportBatches: number;
  /** Payroll runs that reached at least review — proof payroll was exercised. */
  validatedPayrollRuns: number;
}

export interface ReadinessItem {
  label: string;
  done: boolean;
  detail?: string;
  /** Setup-wizard step that satisfies this item, when one owns it. */
  wizardStep?: number;
}

export async function getConfigStats(
  actor: ActorContext,
  orgs: { id: string; name: string }[]
): Promise<OrgConfigStats[]> {
  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length === 0) return [];

  const [
    departments,
    memberships,
    invitations,
    trainerAssignments,
    compAssignments,
    services,
    aliases,
    periods,
    plans,
    versions,
    adminRoles,
    batches,
    payrollRuns,
  ] = await Promise.all([
    actor.supabase
      .from("departments")
      .select("organization_id")
      .in("organization_id", orgIds)
      .eq("status", "active"),
    actor.supabase
      .from("organization_memberships")
      .select("organization_id, role_id")
      .in("organization_id", orgIds)
      .is("effective_to", null),
    actor.supabase
      .from("invitations")
      .select("organization_id")
      .in("organization_id", orgIds)
      .eq("status", "pending"),
    actor.supabase
      .from("trainer_organization_assignments")
      .select("organization_id, trainer_id")
      .in("organization_id", orgIds)
      .is("effective_to", null),
    actor.supabase
      .from("trainer_compensation_assignments")
      .select("organization_id, trainer_id")
      .in("organization_id", orgIds)
      .is("effective_to", null),
    actor.supabase
      .from("services")
      .select("organization_id, id")
      .in("organization_id", orgIds)
      .eq("status", "active"),
    actor.supabase
      .from("service_source_aliases")
      .select("organization_id, service_id")
      .in("organization_id", orgIds),
    actor.supabase
      .from("reporting_periods")
      .select("organization_id, status")
      .in("organization_id", orgIds),
    actor.supabase
      .from("compensation_plans")
      .select("organization_id")
      .in("organization_id", orgIds)
      .eq("status", "active"),
    actor.supabase
      .from("compensation_plan_versions")
      .select("organization_id")
      .in("organization_id", orgIds)
      .eq("status", "published"),
    actor.supabase.from("roles").select("id, key"),
    actor.supabase
      .from("import_batches")
      .select("organization_id, status")
      .in("organization_id", orgIds),
    actor.supabase
      .from("payroll_runs")
      .select("organization_id, status")
      .in("organization_id", orgIds),
  ]);

  const adminRoleIds = new Set(
    (adminRoles.data ?? [])
      .filter((r) => r.key === "platform_admin" || r.key === "workspace_admin")
      .map((r) => r.id)
  );

  return orgs.map((org) => {
    const orgServices = (services.data ?? []).filter(
      (s) => s.organization_id === org.id
    );
    const aliasedServiceIds = new Set(
      (aliases.data ?? [])
        .filter((a) => a.organization_id === org.id)
        .map((a) => a.service_id)
    );
    const orgTrainerIds = new Set(
      (trainerAssignments.data ?? [])
        .filter((t) => t.organization_id === org.id)
        .map((t) => t.trainer_id)
    );
    const compensatedTrainerIds = new Set(
      (compAssignments.data ?? [])
        .filter((c) => c.organization_id === org.id)
        .map((c) => c.trainer_id)
    );
    const orgPeriods = (periods.data ?? []).filter(
      (p) => p.organization_id === org.id
    );
    const orgBatches = (batches.data ?? []).filter(
      (b) => b.organization_id === org.id
    );
    // "Validated" means the run got far enough to produce reviewable
    // numbers. Draft and failed runs prove nothing.
    const validatedRunStates = new Set([
      "needs_review",
      "ready_for_approval",
      "approved",
      "posted",
      "locked",
      "reopened",
    ]);

    return {
      organizationId: org.id,
      organizationName: org.name,
      departments: (departments.data ?? []).filter(
        (d) => d.organization_id === org.id
      ).length,
      members: (memberships.data ?? []).filter(
        (m) => m.organization_id === org.id
      ).length,
      admins: (memberships.data ?? []).filter(
        (m) => m.organization_id === org.id && adminRoleIds.has(m.role_id)
      ).length,
      pendingInvitations: (invitations.data ?? []).filter(
        (i) => i.organization_id === org.id
      ).length,
      activeTrainers: orgTrainerIds.size,
      trainersWithCompensation: [...orgTrainerIds].filter((id) =>
        compensatedTrainerIds.has(id)
      ).length,
      activeServices: orgServices.length,
      servicesWithAliases: orgServices.filter((s) => aliasedServiceIds.has(s.id))
        .length,
      reportingPeriods: orgPeriods.length,
      openPeriods: orgPeriods.filter((p) => p.status === "open").length,
      compensationPlans: (plans.data ?? []).filter(
        (p) => p.organization_id === org.id
      ).length,
      publishedVersions: (versions.data ?? []).filter(
        (v) => v.organization_id === org.id
      ).length,
      importBatches: orgBatches.length,
      postedImportBatches: orgBatches.filter((b) => b.status === "posted").length,
      validatedPayrollRuns: (payrollRuns.data ?? []).filter(
        (r) => r.organization_id === org.id && validatedRunStates.has(r.status)
      ).length,
    };
  });
}

/**
 * Setup-readiness checklist, in the owner's language and in the order the
 * setup wizard walks. Payroll-ready ONLY when every item passes.
 *
 * The evaluation rules are unchanged from the configuration-object
 * version that preceded it — same tables, same thresholds. What changed
 * is the vocabulary ("Trainers reviewed" rather than "Trainers
 * configured") and one substantive fix: the old list carried a
 * permanently-false "Scheduling export sample received" item, so no
 * organization could ever reach 100%. That is now a real check against
 * uploaded batches.
 *
 * `wizardStep` ties each item to the wizard step that satisfies it, so
 * the progress bar and this checklist can never disagree. Items with no
 * step are prerequisites the wizard does not own.
 */
export function readinessChecklist(stats: OrgConfigStats): ReadinessItem[] {
  return [
    { label: "Organization created", done: true, wizardStep: 1 },
    {
      label: "Reporting periods set up",
      done: stats.reportingPeriods > 0,
      detail: `${stats.reportingPeriods}`,
      wizardStep: 1,
    },
    {
      label: "Scheduling file uploaded",
      done: stats.importBatches > 0,
      detail: stats.importBatches > 0 ? `${stats.importBatches}` : "none yet",
      wizardStep: 2,
    },
    {
      label: "Trainers reviewed",
      done: stats.activeTrainers > 0,
      detail: `${stats.activeTrainers}`,
      wizardStep: 3,
    },
    {
      label: "Services reviewed",
      done: stats.activeServices > 0,
      detail: `${stats.activeServices}`,
      wizardStep: 4,
    },
    {
      label: "Service names matched to your schedule",
      done: stats.activeServices > 0 && stats.servicesWithAliases === stats.activeServices,
      detail: `${stats.servicesWithAliases}/${stats.activeServices}`,
      wizardStep: 4,
    },
    {
      label: "Compensation plans published",
      done: stats.publishedVersions > 0,
      detail: `${stats.publishedVersions}`,
      wizardStep: 5,
    },
    {
      label: "Trainer plans assigned",
      done:
        stats.activeTrainers > 0 &&
        stats.trainersWithCompensation === stats.activeTrainers,
      detail: `${stats.trainersWithCompensation}/${stats.activeTrainers}`,
      wizardStep: 5,
    },
    {
      label: "Payroll validated",
      done: stats.validatedPayrollRuns > 0,
      detail: stats.validatedPayrollRuns > 0 ? `${stats.validatedPayrollRuns}` : "not yet run",
      wizardStep: 6,
    },
    {
      label: "Someone can administer this workspace",
      done: stats.admins > 0,
      detail: `${stats.admins}`,
    },
  ];
}

/** True when every readiness item passes — the wizard's "Ready" state. */
export function isSetupComplete(stats: OrgConfigStats): boolean {
  return readinessChecklist(stats).every((item) => item.done);
}

/** The first wizard step with unfinished work, or null when complete. */
export function nextIncompleteStep(stats: OrgConfigStats): number | null {
  const pending = readinessChecklist(stats)
    .filter((item) => !item.done && item.wizardStep !== undefined)
    .map((item) => item.wizardStep as number)
    .sort((a, b) => a - b);
  return pending[0] ?? null;
}
