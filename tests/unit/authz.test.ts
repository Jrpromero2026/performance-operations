import { describe, expect, it } from "vitest";
import {
  canAccessAllWorkspaces,
  canAccessDepartment,
  canAccessOrganization,
  hasPermissionInOrganization,
  isPlatformAdmin,
  roleHasPermission,
  type MembershipGrant,
} from "@/lib/authz/authz";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type Permission,
} from "@/lib/authz/permissions";

const ORG_A = "org-a";
const ORG_B = "org-b";
const DEPT_1 = "dept-1";
const DEPT_2 = "dept-2";

function grant(overrides: Partial<MembershipGrant>): MembershipGrant {
  return {
    organizationId: ORG_A,
    roleKey: "viewer",
    isDefault: false,
    ...overrides,
  };
}

describe("roleHasPermission (deny by default)", () => {
  it("platform_admin holds every permission", () => {
    for (const permission of PERMISSIONS) {
      expect(roleHasPermission("platform_admin", permission)).toBe(true);
    }
  });

  it("trainer cannot touch payroll approval or compensation", () => {
    expect(roleHasPermission("trainer", "payroll:approve")).toBe(false);
    expect(roleHasPermission("trainer", "compensation:manage")).toBe(false);
    expect(roleHasPermission("trainer", "payroll:read_self")).toBe(true);
  });

  it("payroll_manager cannot modify platform-wide settings", () => {
    expect(roleHasPermission("payroll_manager", "org:manage")).toBe(false);
    expect(roleHasPermission("payroll_manager", "org:create")).toBe(false);
    expect(roleHasPermission("payroll_manager", "payroll:approve")).toBe(true);
  });

  it("viewer is read-only", () => {
    const writable: Permission[] = [
      "org:manage",
      "department:manage",
      "trainer:manage",
      "payroll:calculate",
      "member:manage",
    ];
    for (const permission of writable) {
      expect(roleHasPermission("viewer", permission)).toBe(false);
    }
    expect(roleHasPermission("viewer", "report:read")).toBe(true);
  });

  it("only platform_admin can reopen locked periods or read all audit logs", () => {
    for (const [role, grants] of Object.entries(ROLE_PERMISSIONS)) {
      const expected = role === "platform_admin";
      expect(grants.includes("payroll:reopen")).toBe(expected);
      expect(grants.includes("audit:read_all")).toBe(expected);
      expect(grants.includes("org:read_all")).toBe(expected);
    }
  });
});

describe("organization scoping", () => {
  it("denies access with no memberships", () => {
    expect(canAccessOrganization([], ORG_A)).toBe(false);
    expect(hasPermissionInOrganization([], ORG_A, "org:read")).toBe(false);
  });

  it("scopes access to the member's own organizations", () => {
    const memberships = [grant({ roleKey: "workspace_admin" })];
    expect(canAccessOrganization(memberships, ORG_A)).toBe(true);
    expect(canAccessOrganization(memberships, ORG_B)).toBe(false);
    expect(
      hasPermissionInOrganization(memberships, ORG_B, "trainer:manage")
    ).toBe(false);
  });

  it("platform admins may access every organization", () => {
    const memberships = [
      grant({ organizationId: ORG_A, roleKey: "platform_admin" }),
    ];
    expect(isPlatformAdmin(memberships)).toBe(true);
    expect(canAccessOrganization(memberships, ORG_B)).toBe(true);
    expect(
      hasPermissionInOrganization(memberships, ORG_B, "payroll:approve")
    ).toBe(true);
  });

  it("a user may hold different roles in different organizations", () => {
    const memberships = [
      grant({ organizationId: ORG_A, roleKey: "workspace_admin" }),
      grant({ organizationId: ORG_B, roleKey: "viewer" }),
    ];
    expect(
      hasPermissionInOrganization(memberships, ORG_A, "payroll:approve")
    ).toBe(true);
    expect(
      hasPermissionInOrganization(memberships, ORG_B, "payroll:approve")
    ).toBe(false);
  });

  it("empty organization id is always denied", () => {
    const memberships = [grant({ roleKey: "platform_admin" })];
    expect(canAccessOrganization(memberships, "")).toBe(false);
    expect(hasPermissionInOrganization(memberships, "", "org:read")).toBe(false);
  });
});

describe("All Workspaces access", () => {
  it("is granted only via org:read_all", () => {
    expect(canAccessAllWorkspaces([grant({ roleKey: "platform_admin" })])).toBe(true);
    expect(canAccessAllWorkspaces([grant({ roleKey: "workspace_admin" })])).toBe(false);
    expect(canAccessAllWorkspaces([grant({ roleKey: "viewer" })])).toBe(false);
    expect(canAccessAllWorkspaces([])).toBe(false);
  });
});

describe("department scoping", () => {
  it("narrows department managers to their assigned departments", () => {
    const memberships = [
      grant({ roleKey: "department_manager", departmentIds: [DEPT_1] }),
    ];
    expect(canAccessDepartment(memberships, ORG_A, DEPT_1)).toBe(true);
    expect(canAccessDepartment(memberships, ORG_A, DEPT_2)).toBe(false);
  });

  it("denies department managers with no department grants", () => {
    const memberships = [grant({ roleKey: "department_manager" })];
    expect(canAccessDepartment(memberships, ORG_A, DEPT_1)).toBe(false);
  });

  it("org-wide roles see all departments in their organizations only", () => {
    const memberships = [grant({ roleKey: "workspace_admin" })];
    expect(canAccessDepartment(memberships, ORG_A, DEPT_1)).toBe(true);
    expect(canAccessDepartment(memberships, ORG_B, DEPT_1)).toBe(false);
  });

  it("trainer role has no department:read and is denied", () => {
    const memberships = [grant({ roleKey: "trainer" })];
    expect(canAccessDepartment(memberships, ORG_A, DEPT_1)).toBe(false);
  });
});
