import { describe, expect, it } from "vitest";
import { resolveAccess } from "@/lib/intelligence/service";
import type { MembershipGrant } from "@/lib/authz/authz";

const ORG = "org-1";
const OTHER = "org-2";

function grant(
  roleKey: MembershipGrant["roleKey"],
  organizationId = ORG,
  departmentIds?: string[],
): MembershipGrant {
  return { organizationId, roleKey, isDefault: false, departmentIds };
}

describe("resolveAccess", () => {
  it("platform admins get org access everywhere", () => {
    expect(
      resolveAccess([grant("platform_admin", OTHER)], ORG, "payroll:read", undefined, null),
    ).toEqual({ kind: "org" });
  });
  it("workspace admins get org access in their organization only", () => {
    expect(
      resolveAccess([grant("workspace_admin")], ORG, "appointment:read", undefined, null),
    ).toEqual({ kind: "org" });
    expect(
      resolveAccess([grant("workspace_admin", OTHER)], ORG, "appointment:read", undefined, null),
    ).toEqual({ kind: "none" });
  });
  it("department managers are department-scoped", () => {
    const access = resolveAccess(
      [grant("department_manager", ORG, ["dept-a", "dept-b"])],
      ORG,
      "appointment:read",
      undefined,
      null,
    );
    expect(access).toEqual({ kind: "departments", departmentIds: ["dept-a", "dept-b"] });
  });
  it("department managers never see payroll metrics", () => {
    expect(
      resolveAccess(
        [grant("department_manager", ORG, ["dept-a"])],
        ORG,
        "payroll:read",
        "payroll:read_self",
        null,
      ),
    ).toEqual({ kind: "none" });
  });
  it("trainers get self access only, and only with a trainer record", () => {
    expect(
      resolveAccess([grant("trainer")], ORG, "appointment:read", "trainer:read_self", "trainer-9"),
    ).toEqual({ kind: "self", trainerId: "trainer-9" });
    expect(
      resolveAccess([grant("trainer")], ORG, "appointment:read", "trainer:read_self", null),
    ).toEqual({ kind: "none" });
    expect(
      resolveAccess([grant("trainer")], ORG, "payroll:read", "payroll:read_self", "trainer-9"),
    ).toEqual({ kind: "self", trainerId: "trainer-9" });
  });
  it("viewers can read appointment metrics but not payroll or readiness", () => {
    expect(
      resolveAccess([grant("viewer")], ORG, "appointment:read", undefined, null),
    ).toEqual({ kind: "org" });
    expect(
      resolveAccess([grant("viewer")], ORG, "payroll:read", "payroll:read_self", null),
    ).toEqual({ kind: "none" });
    expect(
      resolveAccess([grant("viewer")], ORG, "report:manage", undefined, null),
    ).toEqual({ kind: "none" });
  });
  it("an org role beats a department-scoped role when both exist", () => {
    expect(
      resolveAccess(
        [grant("department_manager", ORG, ["dept-a"]), grant("workspace_admin")],
        ORG,
        "appointment:read",
        undefined,
        null,
      ),
    ).toEqual({ kind: "org" });
  });
});
