import { describe, expect, it } from "vitest";
import { COMMANDS, filterCommands } from "@/lib/operations/commands";
import { ROLE_PERMISSIONS } from "@/lib/authz/permissions";

describe("command palette filtering", () => {
  it("permission-less users only see unrestricted entries", () => {
    const results = filterCommands(COMMANDS, [], "");
    expect(results.every((c) => c.permission === null)).toBe(true);
    expect(results.map((c) => c.id)).toContain("page-overview");
    expect(results.map((c) => c.id)).toContain("page-notifications");
  });

  it("trainers see their pages but no admin actions", () => {
    const trainerPermissions = [...ROLE_PERMISSIONS.trainer];
    const results = filterCommands(COMMANDS, trainerPermissions, "");
    const ids = results.map((c) => c.id);
    expect(ids).toContain("page-payroll-time"); // payroll:manage_time
    expect(ids).toContain("action-log-time");
    expect(ids).not.toContain("page-payroll"); // payroll:read denied
    expect(ids).not.toContain("action-create-payroll");
    expect(ids).not.toContain("page-config-users");
  });

  it("workspace admins see management actions", () => {
    const adminPermissions = [...ROLE_PERMISSIONS.workspace_admin];
    const ids = filterCommands(COMMANDS, adminPermissions, "").map((c) => c.id);
    expect(ids).toContain("action-create-payroll");
    expect(ids).toContain("action-upload-import");
    expect(ids).toContain("page-config-compensation");
  });

  it("queries match labels and keywords, case-insensitively", () => {
    const adminPermissions = [...ROLE_PERMISSIONS.workspace_admin];
    expect(
      filterCommands(COMMANDS, adminPermissions, "PAYROLL").map((c) => c.id),
    ).toContain("page-payroll");
    // keyword match: "csv" → upload import
    expect(
      filterCommands(COMMANDS, adminPermissions, "csv").map((c) => c.id),
    ).toContain("action-upload-import");
    expect(filterCommands(COMMANDS, adminPermissions, "zzz-nothing")).toEqual([]);
  });

  it("every command has a unique id and a rooted href", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const command of COMMANDS) {
      expect(command.href.startsWith("/")).toBe(true);
    }
  });
});
