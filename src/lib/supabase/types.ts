/**
 * Database types for the Performance Operations schema.
 *
 * Hand-maintained to match supabase/migrations until a live project exists;
 * regenerate with:
 *   npx supabase gen types typescript --local > src/lib/supabase/types.ts
 * (see README). Shapes below mirror migration 20260728000001.
 */

export type OrganizationStatus = "active" | "inactive";
export type ReportingPeriodStatus = "draft" | "open" | "closed" | "locked";

export interface OrganizationRow {
  id: string;
  slug: string;
  name: string;
  status: OrganizationStatus;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface LocationRow {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
}

export interface DepartmentRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
}

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string;
  department_scoped: boolean;
  created_at: string;
  updated_at: string;
}

export interface PermissionRow {
  id: string;
  key: string;
  description: string;
  created_at: string;
}

export interface RolePermissionRow {
  role_id: string;
  permission_id: string;
  created_at: string;
}

export interface OrganizationMembershipRow {
  id: string;
  profile_id: string;
  organization_id: string;
  role_id: string;
  is_default: boolean;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface DepartmentMembershipRow {
  id: string;
  profile_id: string;
  organization_id: string;
  department_id: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainerRow {
  id: string;
  profile_id: string | null;
  display_name: string;
  email: string | null;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
}

export interface TrainerOrganizationAssignmentRow {
  id: string;
  trainer_id: string;
  organization_id: string;
  title: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainerDepartmentAssignmentRow {
  id: string;
  trainer_id: string;
  organization_id: string;
  department_id: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportingPeriodRow {
  id: string;
  organization_id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: ReportingPeriodStatus;
  created_at: string;
  updated_at: string;
}

export interface AuditEventRow {
  id: string;
  organization_id: string | null;
  actor_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Minimal Database generic for @supabase/supabase-js typing. */
export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: OrganizationRow;
        Insert: Partial<OrganizationRow> & Pick<OrganizationRow, "slug" | "name">;
        Update: Partial<OrganizationRow>;
        Relationships: [];
      };
      locations: {
        Row: LocationRow;
        Insert: Partial<LocationRow> & Pick<LocationRow, "organization_id" | "name">;
        Update: Partial<LocationRow>;
        Relationships: [];
      };
      departments: {
        Row: DepartmentRow;
        Insert: Partial<DepartmentRow> & Pick<DepartmentRow, "organization_id" | "name">;
        Update: Partial<DepartmentRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & Pick<ProfileRow, "id" | "email">;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      roles: {
        Row: RoleRow;
        Insert: Partial<RoleRow> & Pick<RoleRow, "key" | "name">;
        Update: Partial<RoleRow>;
        Relationships: [];
      };
      permissions: {
        Row: PermissionRow;
        Insert: Partial<PermissionRow> & Pick<PermissionRow, "key">;
        Update: Partial<PermissionRow>;
        Relationships: [];
      };
      role_permissions: {
        Row: RolePermissionRow;
        Insert: RolePermissionRow;
        Update: Partial<RolePermissionRow>;
        Relationships: [];
      };
      organization_memberships: {
        Row: OrganizationMembershipRow;
        Insert: Partial<OrganizationMembershipRow> &
          Pick<OrganizationMembershipRow, "profile_id" | "organization_id" | "role_id">;
        Update: Partial<OrganizationMembershipRow>;
        Relationships: [];
      };
      department_memberships: {
        Row: DepartmentMembershipRow;
        Insert: Partial<DepartmentMembershipRow> &
          Pick<DepartmentMembershipRow, "profile_id" | "organization_id" | "department_id">;
        Update: Partial<DepartmentMembershipRow>;
        Relationships: [];
      };
      trainers: {
        Row: TrainerRow;
        Insert: Partial<TrainerRow> & Pick<TrainerRow, "display_name">;
        Update: Partial<TrainerRow>;
        Relationships: [];
      };
      trainer_organization_assignments: {
        Row: TrainerOrganizationAssignmentRow;
        Insert: Partial<TrainerOrganizationAssignmentRow> &
          Pick<TrainerOrganizationAssignmentRow, "trainer_id" | "organization_id">;
        Update: Partial<TrainerOrganizationAssignmentRow>;
        Relationships: [];
      };
      trainer_department_assignments: {
        Row: TrainerDepartmentAssignmentRow;
        Insert: Partial<TrainerDepartmentAssignmentRow> &
          Pick<TrainerDepartmentAssignmentRow, "trainer_id" | "organization_id" | "department_id">;
        Update: Partial<TrainerDepartmentAssignmentRow>;
        Relationships: [];
      };
      reporting_periods: {
        Row: ReportingPeriodRow;
        Insert: Partial<ReportingPeriodRow> &
          Pick<ReportingPeriodRow, "organization_id" | "label" | "start_date" | "end_date">;
        Update: Partial<ReportingPeriodRow>;
        Relationships: [];
      };
      audit_events: {
        Row: AuditEventRow;
        Insert: Partial<AuditEventRow> & Pick<AuditEventRow, "entity_type" | "action">;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
