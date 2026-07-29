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
}

export interface ReadinessItem {
  label: string;
  done: boolean;
  detail?: string;
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
    };
  });
}

/** Setup-readiness checklist. Payroll-ready ONLY when every item passes. */
export function readinessChecklist(stats: OrgConfigStats): ReadinessItem[] {
  return [
    { label: "Organization exists", done: true },
    {
      label: "Departments configured",
      done: stats.departments > 0,
      detail: `${stats.departments}`,
    },
    {
      label: "At least one admin assigned",
      done: stats.admins > 0,
      detail: `${stats.admins}`,
    },
    {
      label: "Trainers configured",
      done: stats.activeTrainers > 0,
      detail: `${stats.activeTrainers}`,
    },
    {
      label: "Services configured",
      done: stats.activeServices > 0,
      detail: `${stats.activeServices}`,
    },
    {
      label: "Service aliases mapped",
      done: stats.activeServices > 0 && stats.servicesWithAliases === stats.activeServices,
      detail: `${stats.servicesWithAliases}/${stats.activeServices}`,
    },
    {
      label: "Reporting period configured",
      done: stats.reportingPeriods > 0,
      detail: `${stats.reportingPeriods}`,
    },
    {
      label: "Compensation plans published",
      done: stats.publishedVersions > 0,
      detail: `${stats.publishedVersions}`,
    },
    {
      label: "Trainer compensation assignments complete",
      done:
        stats.activeTrainers > 0 &&
        stats.trainersWithCompensation === stats.activeTrainers,
      detail: `${stats.trainersWithCompensation}/${stats.activeTrainers}`,
    },
    {
      label: "Scheduling export sample received",
      done: false,
      detail: "awaiting business input",
    },
  ];
}
