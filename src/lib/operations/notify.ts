/**
 * In-app notification emission. Called from existing server actions at key
 * lifecycle moments (import posted/reversed, payroll approved/posted/
 * reopened). Recipients are the organization's holders of a permission —
 * derived from real memberships, never hard-coded roles. The actor is
 * excluded (you don't notify yourself). Failures never break the calling
 * workflow.
 */

import type { ActorContext } from "@/lib/actions/shared";
import { ROLE_PERMISSIONS, type Permission, type RoleKey } from "@/lib/authz/permissions";

export interface NotificationInput {
  category: "payroll" | "imports" | "configuration" | "reporting" | "system";
  severity?: "info" | "warning" | "critical";
  title: string;
  body?: string;
  linkPath?: string;
  entityType?: string;
  entityId?: string;
}

/** Notify every member of the org whose role grants `permission`. */
export async function notifyPermissionHolders(
  actor: ActorContext,
  organizationId: string,
  permission: Permission,
  input: NotificationInput,
): Promise<void> {
  try {
    const { data: memberships } = await actor.supabase
      .from("organization_memberships")
      .select("profile_id, roles ( key )")
      .eq("organization_id", organizationId)
      .is("effective_to", null);
    const recipients = new Set<string>();
    for (const row of memberships ?? []) {
      const role = row.roles as unknown as { key: string } | null;
      if (!role) continue;
      const permissions = ROLE_PERMISSIONS[role.key as RoleKey] ?? [];
      if (permissions.includes(permission) && row.profile_id !== actor.userId) {
        recipients.add(row.profile_id);
      }
    }
    if (recipients.size === 0) return;
    const { error } = await actor.supabase.from("notifications").insert(
      [...recipients].map((recipientId) => ({
        recipient_id: recipientId,
        organization_id: organizationId,
        category: input.category,
        severity: input.severity ?? "info",
        title: input.title,
        body: input.body ?? "",
        link_path: input.linkPath ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        actor_id: actor.userId,
      })),
    );
    if (error) console.error("notification_emit_failed", input.title, error.code);
  } catch (error) {
    console.error("notification_emit_failed", input.title, error);
  }
}
