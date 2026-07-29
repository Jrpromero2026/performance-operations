/**
 * Static command registry for the command palette: pages and actions with
 * the permission each requires. Filtering is pure and unit-tested; entity
 * results come from the server search (search.ts) — one implementation for
 * both the palette and global search.
 */

import type { Permission } from "@/lib/authz/permissions";

export interface CommandEntry {
  id: string;
  group: "Pages" | "Actions";
  label: string;
  href: string;
  keywords: string;
  /** Permission required in the selected organization; null = any signed-in user. */
  permission: Permission | null;
}

export const COMMANDS: CommandEntry[] = [
  // Pages
  { id: "page-overview", group: "Pages", label: "Overview", href: "/overview", keywords: "home dashboard executive", permission: null },
  { id: "page-imports", group: "Pages", label: "Imports", href: "/imports", keywords: "batches csv upload", permission: "import:read" },
  { id: "page-appointments", group: "Pages", label: "Appointments", href: "/appointments", keywords: "ledger sessions", permission: "appointment:read" },
  { id: "page-payroll", group: "Pages", label: "Payroll", href: "/payroll", keywords: "runs compensation pay", permission: "payroll:read" },
  { id: "page-payroll-time", group: "Pages", label: "Time entries", href: "/payroll/time", keywords: "manual hours admin time", permission: "payroll:manage_time" },
  { id: "page-payroll-adjustments", group: "Pages", label: "Adjustments", href: "/payroll/adjustments", keywords: "bonus deduction", permission: "payroll:manage_adjustments" },
  { id: "page-trainers", group: "Pages", label: "Trainers", href: "/trainers", keywords: "coaches staff", permission: "trainer:read" },
  { id: "page-clients", group: "Pages", label: "Clients", href: "/clients", keywords: "customers members", permission: "client:read" },
  { id: "page-reports", group: "Pages", label: "Reports", href: "/reports", keywords: "metrics intelligence analytics", permission: null },
  { id: "page-configuration", group: "Pages", label: "Configuration", href: "/configuration", keywords: "settings setup", permission: "org:read" },
  { id: "page-config-services", group: "Pages", label: "Services", href: "/configuration/services", keywords: "offerings aliases", permission: "service:read" },
  { id: "page-config-periods", group: "Pages", label: "Reporting periods", href: "/configuration/reporting-periods", keywords: "months windows", permission: "period:read" },
  { id: "page-config-compensation", group: "Pages", label: "Compensation plans", href: "/configuration/compensation", keywords: "pay plans rates tiers", permission: "compensation:read" },
  { id: "page-config-users", group: "Pages", label: "Users & access", href: "/configuration/users", keywords: "members invitations roles", permission: "member:read" },
  { id: "page-audit", group: "Pages", label: "Audit log", href: "/audit", keywords: "history events activity", permission: "audit:read" },
  { id: "page-notifications", group: "Pages", label: "Notifications", href: "/notifications", keywords: "inbox alerts unread", permission: null },
  // Actions
  { id: "action-upload-import", group: "Actions", label: "Upload import file", href: "/imports/new", keywords: "new csv setmore", permission: "import:upload" },
  { id: "action-create-payroll", group: "Actions", label: "Create payroll run", href: "/payroll/new", keywords: "new run prepare", permission: "payroll:create" },
  { id: "action-create-trainer", group: "Actions", label: "Add trainer", href: "/trainers/new", keywords: "new coach hire", permission: "trainer:manage" },
  { id: "action-create-service", group: "Actions", label: "Add service", href: "/configuration/services/new", keywords: "new offering", permission: "service:manage" },
  { id: "action-create-period", group: "Actions", label: "Create reporting period", href: "/configuration/reporting-periods/new", keywords: "new month window", permission: "period:manage" },
  { id: "action-create-plan", group: "Actions", label: "Create compensation plan", href: "/configuration/compensation/new", keywords: "new pay plan", permission: "compensation:manage" },
  { id: "action-log-time", group: "Actions", label: "Log time entry", href: "/payroll/time", keywords: "hours manual admin", permission: "payroll:manage_time" },
];

/** Pure permission + query filter (used client-side with granted perms). */
export function filterCommands(
  entries: readonly CommandEntry[],
  grantedPermissions: readonly string[],
  query: string,
): CommandEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (entry.permission && !grantedPermissions.includes(entry.permission)) {
      return false;
    }
    if (q === "") return true;
    return (
      entry.label.toLowerCase().includes(q) || entry.keywords.includes(q)
    );
  });
}
