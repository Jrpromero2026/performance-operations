import {
  ROLE_PERMISSIONS,
  type Permission,
  type RoleKey,
} from "./permissions";

/**
 * Pure authorization helpers. Deny by default: anything not explicitly
 * granted returns false. These run server-side; RLS is the final backstop.
 */

/** One active organization membership for the current user. */
export interface MembershipGrant {
  organizationId: string;
  roleKey: RoleKey;
  isDefault: boolean;
  /** Department IDs, only meaningful for department-scoped roles. */
  departmentIds?: readonly string[];
}

/** Does this role grant this permission? Unknown roles/permissions deny. */
export function roleHasPermission(roleKey: RoleKey, permission: Permission): boolean {
  const grants = ROLE_PERMISSIONS[roleKey];
  if (!grants) return false;
  return grants.includes(permission);
}

/** Does the user hold `permission` in the given organization? */
export function hasPermissionInOrganization(
  memberships: readonly MembershipGrant[],
  organizationId: string,
  permission: Permission
): boolean {
  if (!organizationId) return false;
  return memberships.some(
    (m) =>
      (m.organizationId === organizationId || m.roleKey === "platform_admin") &&
      roleHasPermission(m.roleKey, permission)
  );
}

/** Platform admins hold access to every organization. */
export function isPlatformAdmin(memberships: readonly MembershipGrant[]): boolean {
  return memberships.some((m) => m.roleKey === "platform_admin");
}

/** May the user read data for this organization at all? */
export function canAccessOrganization(
  memberships: readonly MembershipGrant[],
  organizationId: string
): boolean {
  if (!organizationId) return false;
  if (isPlatformAdmin(memberships)) return true;
  return memberships.some(
    (m) => m.organizationId === organizationId && roleHasPermission(m.roleKey, "org:read")
  );
}

/** "All Workspaces" requires the cross-organization permission. */
export function canAccessAllWorkspaces(memberships: readonly MembershipGrant[]): boolean {
  return memberships.some((m) => roleHasPermission(m.roleKey, "org:read_all"));
}

/** May the user see this department? (Department-scoped roles are narrowed.) */
export function canAccessDepartment(
  memberships: readonly MembershipGrant[],
  organizationId: string,
  departmentId: string
): boolean {
  if (isPlatformAdmin(memberships)) return true;
  const membership = memberships.find((m) => m.organizationId === organizationId);
  if (!membership) return false;
  if (!roleHasPermission(membership.roleKey, "department:read")) return false;
  if (membership.roleKey === "department_manager") {
    return (membership.departmentIds ?? []).includes(departmentId);
  }
  return true;
}
