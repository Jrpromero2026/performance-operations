/**
 * Permission and role catalog.
 *
 * Mirrors supabase/seed.sql — the database is the source of truth; this
 * module exists so server code can make deny-by-default decisions without a
 * round-trip and so the mapping is unit-testable. Keep the two in sync.
 */

export const PERMISSIONS = [
  "org:read",
  "org:read_all",
  "org:manage",
  "org:create",
  "department:read",
  "department:manage",
  "trainer:read",
  "trainer:read_self",
  "trainer:manage",
  "client:read",
  "client:manage",
  "service:read",
  "service:manage",
  "import:read",
  "import:manage",
  "import:approve",
  "payroll:read",
  "payroll:read_self",
  "payroll:calculate",
  "payroll:approve",
  "payroll:export",
  "payroll:adjust",
  "payroll:reopen",
  "period:read",
  "period:manage",
  "report:read",
  "report:manage",
  "audit:read",
  "audit:read_all",
  "compensation:read",
  "compensation:manage",
  "member:read",
  "member:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = [
  "platform_admin",
  "workspace_admin",
  "payroll_manager",
  "department_manager",
  "trainer",
  "viewer",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

/** Roles whose visibility is limited to assigned departments. */
export const DEPARTMENT_SCOPED_ROLES: readonly RoleKey[] = ["department_manager"];

export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  platform_admin: PERMISSIONS,
  workspace_admin: [
    "org:read",
    "org:manage",
    "department:read",
    "department:manage",
    "trainer:read",
    "trainer:manage",
    "client:read",
    "client:manage",
    "service:read",
    "service:manage",
    "import:read",
    "import:manage",
    "import:approve",
    "payroll:read",
    "payroll:calculate",
    "payroll:approve",
    "payroll:export",
    "payroll:adjust",
    "period:read",
    "period:manage",
    "report:read",
    "report:manage",
    "audit:read",
    "compensation:read",
    "compensation:manage",
    "member:read",
    "member:manage",
  ],
  payroll_manager: [
    "org:read",
    "department:read",
    "trainer:read",
    "client:read",
    "service:read",
    "import:read",
    "import:manage",
    "import:approve",
    "payroll:read",
    "payroll:calculate",
    "payroll:approve",
    "payroll:export",
    "payroll:adjust",
    "period:read",
    "report:read",
    "audit:read",
    "compensation:read",
    "member:read",
  ],
  department_manager: [
    "org:read",
    "department:read",
    "trainer:read",
    "client:read",
    "service:read",
    "import:read",
    "period:read",
    "report:read",
    "member:read",
  ],
  trainer: ["org:read", "trainer:read_self", "payroll:read_self", "report:read"],
  viewer: ["org:read", "department:read", "period:read", "report:read"],
};
