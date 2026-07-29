import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canAccessAllWorkspaces, type MembershipGrant } from "@/lib/authz/authz";
import type { RoleKey } from "@/lib/authz/permissions";
import {
  ALL_WORKSPACES,
  BOOTSTRAP_WORKSPACES,
  WORKSPACE_COOKIE,
} from "./constants";
import {
  resolveWorkspaceSelection,
  type WorkspaceSelection,
} from "./resolver";

export interface WorkspaceOption {
  id: string;
  slug: string;
  name: string;
}

export interface WorkspaceContext {
  /** Where this context came from. `database` = real, validated data. */
  source: "database" | "offline";
  /** Workspaces the current user may select. */
  options: WorkspaceOption[];
  /** Whether the user may choose "All Workspaces". */
  canAccessAll: boolean;
  /** The validated, resolved selection (never trusts the raw cookie). */
  selection: WorkspaceSelection;
  /** Convenience: the selected organization option, when one is selected. */
  selected: WorkspaceOption | null;
  /** The signed-in user's memberships (empty in offline mode). */
  memberships: MembershipGrant[];
  /** Display name of the signed-in user, when known. */
  userName: string | null;
  userEmail: string | null;
}

/**
 * Resolve the workspace context for the current request.
 *
 * Access is loaded server-side from the database (organization_memberships
 * joined to roles); the workspace cookie is only ever validated against that
 * list. When Supabase is not configured or nobody is signed in, the shell
 * falls back to an explicit offline preview context so development and E2E
 * tests can exercise navigation — clearly labeled, with no real data.
 */
export async function getWorkspaceContext(): Promise<WorkspaceContext> {
  const cookieStore = await cookies();
  const requested = cookieStore.get(WORKSPACE_COOKIE)?.value ?? null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return offlineContext(requested);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return offlineContext(requested);

  const { data: membershipRows, error } = await supabase
    .from("organization_memberships")
    .select(
      "organization_id, is_default, effective_to, roles ( key ), organizations ( id, slug, name )"
    )
    .is("effective_to", null);

  if (error || !membershipRows) return offlineContext(requested);

  const memberships: MembershipGrant[] = [];
  const options = new Map<string, WorkspaceOption>();
  let defaultOrganizationId: string | null = null;

  for (const row of membershipRows) {
    const role = row.roles as unknown as { key: string } | null;
    const org = row.organizations as unknown as WorkspaceOption | null;
    if (!role || !org) continue;
    memberships.push({
      organizationId: row.organization_id,
      roleKey: role.key as RoleKey,
      isDefault: row.is_default,
    });
    options.set(org.id, { id: org.id, slug: org.slug, name: org.name });
    if (row.is_default) defaultOrganizationId = row.organization_id;
  }

  const canAccessAll = canAccessAllWorkspaces(memberships);

  // Platform admins may select any organization, not just their memberships.
  if (canAccessAll) {
    const { data: allOrgs } = await supabase
      .from("organizations")
      .select("id, slug, name")
      .eq("status", "active")
      .order("name");
    for (const org of allOrgs ?? []) {
      options.set(org.id, { id: org.id, slug: org.slug, name: org.name });
    }
  }

  const optionList = [...options.values()];
  const selection = resolveWorkspaceSelection(requested, {
    organizationIds: optionList.map((o) => o.id),
    defaultOrganizationId,
    canAccessAll,
  });

  return {
    source: "database",
    options: optionList,
    canAccessAll,
    selection,
    selected:
      selection.kind === "organization"
        ? optionList.find((o) => o.id === selection.organizationId) ?? null
        : null,
    memberships,
    userName:
      (user.user_metadata?.full_name as string | undefined) ?? null,
    userEmail: user.email ?? null,
  };
}

/**
 * Offline preview context: bootstrap workspaces mirroring the seed data.
 * Grants "All Workspaces" so the full selector is exercisable; real
 * deployments always resolve through the database path above.
 */
function offlineContext(requested: string | null): WorkspaceContext {
  const options = BOOTSTRAP_WORKSPACES.map((w) => ({
    id: w.id,
    slug: w.slug,
    name: w.name,
  }));
  const selection = resolveWorkspaceSelection(requested, {
    organizationIds: options.map((o) => o.id),
    defaultOrganizationId: options[0]?.id ?? null,
    canAccessAll: true,
  });
  return {
    source: "offline",
    options,
    canAccessAll: true,
    selection,
    selected:
      selection.kind === "organization"
        ? options.find((o) => o.id === selection.organizationId) ?? null
        : null,
    memberships: [],
    userName: null,
    userEmail: null,
  };
}

export { ALL_WORKSPACES, WORKSPACE_COOKIE };
