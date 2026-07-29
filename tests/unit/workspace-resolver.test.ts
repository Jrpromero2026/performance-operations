import { describe, expect, it } from "vitest";
import {
  resolveWorkspaceSelection,
  selectionToCookieValue,
  type WorkspaceAccess,
} from "@/lib/workspace/resolver";
import { ALL_WORKSPACES } from "@/lib/workspace/constants";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const ORG_FORGED = "99999999-9999-9999-9999-999999999999";

function access(overrides: Partial<WorkspaceAccess> = {}): WorkspaceAccess {
  return {
    organizationIds: [ORG_A, ORG_B],
    defaultOrganizationId: null,
    canAccessAll: false,
    ...overrides,
  };
}

describe("resolveWorkspaceSelection", () => {
  it("resolves a valid requested organization", () => {
    expect(resolveWorkspaceSelection(ORG_B, access())).toEqual({
      kind: "organization",
      organizationId: ORG_B,
    });
  });

  it("never resolves to an organization outside the user's access", () => {
    const result = resolveWorkspaceSelection(ORG_FORGED, access());
    expect(result).toEqual({ kind: "organization", organizationId: ORG_A });
  });

  it("falls back to the default organization when the request is invalid", () => {
    const result = resolveWorkspaceSelection(
      ORG_FORGED,
      access({ defaultOrganizationId: ORG_B })
    );
    expect(result).toEqual({ kind: "organization", organizationId: ORG_B });
  });

  it("ignores a default organization the user cannot access", () => {
    const result = resolveWorkspaceSelection(
      null,
      access({ defaultOrganizationId: ORG_FORGED })
    );
    expect(result).toEqual({ kind: "organization", organizationId: ORG_A });
  });

  it("uses the default organization when nothing is requested", () => {
    const result = resolveWorkspaceSelection(
      undefined,
      access({ defaultOrganizationId: ORG_B })
    );
    expect(result).toEqual({ kind: "organization", organizationId: ORG_B });
  });

  it("grants All Workspaces only with cross-organization permission", () => {
    expect(
      resolveWorkspaceSelection(ALL_WORKSPACES, access({ canAccessAll: true }))
    ).toEqual({ kind: "all" });
  });

  it("denies All Workspaces without permission and falls back", () => {
    expect(resolveWorkspaceSelection(ALL_WORKSPACES, access())).toEqual({
      kind: "organization",
      organizationId: ORG_A,
    });
  });

  it("handles losing access to the previously selected organization", () => {
    const result = resolveWorkspaceSelection(
      ORG_B,
      access({ organizationIds: [ORG_A] })
    );
    expect(result).toEqual({ kind: "organization", organizationId: ORG_A });
  });

  it("resolves to none when the user has no access at all", () => {
    const result = resolveWorkspaceSelection(
      ORG_A,
      access({ organizationIds: [] })
    );
    expect(result).toEqual({ kind: "none" });
  });

  it("falls back to All Workspaces for admins with no direct memberships", () => {
    const result = resolveWorkspaceSelection(
      null,
      access({ organizationIds: [], canAccessAll: true })
    );
    expect(result).toEqual({ kind: "all" });
  });
});

describe("selectionToCookieValue", () => {
  it("round-trips each selection kind", () => {
    expect(selectionToCookieValue({ kind: "all" })).toBe(ALL_WORKSPACES);
    expect(
      selectionToCookieValue({ kind: "organization", organizationId: ORG_A })
    ).toBe(ORG_A);
    expect(selectionToCookieValue({ kind: "none" })).toBeNull();
  });
});
