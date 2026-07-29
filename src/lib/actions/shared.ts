import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import {
  computeGrantableRoles,
  hasPermissionInOrganization,
  isPlatformAdmin,
  type MembershipGrant,
} from "@/lib/authz/authz";
import type { Permission, RoleKey } from "@/lib/authz/permissions";

/** Uniform result shape for management server actions. */
export interface ActionState {
  error?: string;
  message?: string;
  /** Optional payload, e.g. a generated invite link. */
  data?: Record<string, string>;
}

export type AppSupabaseClient = SupabaseClient<Database>;

export interface ActorContext {
  supabase: AppSupabaseClient;
  userId: string;
  memberships: MembershipGrant[];
}

/**
 * Load the acting user's identity and ACTIVE memberships fresh from the
 * database. Role and organization information is never accepted from the
 * client; every mutation re-derives it here, and RLS enforces it again.
 */
export async function getActorContext(): Promise<ActorContext | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from("organization_memberships")
    .select("organization_id, is_default, roles ( key )")
    .is("effective_to", null);

  const memberships: MembershipGrant[] = (rows ?? []).flatMap((row) => {
    const role = row.roles as unknown as { key: string } | null;
    if (!role) return [];
    return [
      {
        organizationId: row.organization_id,
        roleKey: role.key as RoleKey,
        isDefault: row.is_default,
      },
    ];
  });

  return { supabase: supabase as AppSupabaseClient, userId: user.id, memberships };
}

/** Deny-by-default permission gate for server actions. */
export function actorCan(
  actor: ActorContext,
  organizationId: string,
  permission: Permission
): boolean {
  return hasPermissionInOrganization(actor.memberships, organizationId, permission);
}

export function actorIsPlatformAdmin(actor: ActorContext): boolean {
  return isPlatformAdmin(actor.memberships);
}

/** Which roles may this actor grant in this organization? (Pure logic in authz.) */
export function grantableRoles(
  actor: ActorContext,
  organizationId: string,
  allRoles: readonly { id: string; key: string }[]
): { id: string; key: string }[] {
  return computeGrantableRoles(actor.memberships, organizationId, allRoles);
}

const DENIED = "You do not have permission to perform this action.";
export const PERMISSION_DENIED: ActionState = { error: DENIED };
export const NOT_SIGNED_IN: ActionState = {
  error: "Your session has expired. Sign in again.",
};

/**
 * Append an audit event. Metadata must already be reduced to safe summary
 * fields — never raw payloads, tokens, or credentials. Failures are surfaced
 * to the caller so financially meaningful actions can refuse to proceed
 * silently; for Phase 2 configuration writes we log-and-continue.
 */
export async function writeAudit(
  actor: ActorContext,
  event: {
    organizationId: string | null;
    entityType: string;
    entityId?: string | null;
    action: string;
    metadata?: Record<string, Json>;
  }
): Promise<void> {
  const { error } = await actor.supabase.from("audit_events").insert({
    organization_id: event.organizationId,
    actor_id: actor.userId,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    action: event.action,
    metadata: (event.metadata ?? {}) as Json,
  });
  if (error) {
    console.error("audit_write_failed", event.entityType, event.action);
  }
}

/** ISO date (YYYY-MM-DD) or empty-string→undefined helper for forms. */
export function optionalDate(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value;
}
