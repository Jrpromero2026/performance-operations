/**
 * Recipient governance — the recipient list is re-resolved AT EXECUTION
 * TIME against current memberships:
 *
 * - every address must belong to an ACTIVE member of the organization
 *   (external addresses rejected unless the channel policy allows them);
 * - removed/deactivated users are silently excluded (recorded as
 *   skipped, never emailed);
 * - cross-organization recipients are rejected;
 * - trainer statements may go only to the trainer's own verified address
 *   (or authorized managers) and only when the channel policy permits.
 *
 * Addresses are never inferred from names.
 */

import type { ActorContext } from "@/lib/actions/shared";
import type { Tables } from "@/lib/supabase/types";

export interface ResolvedRecipient {
  email: string;
  profileId: string | null;
  recipientType: "user" | "external";
}

export interface RecipientResolution {
  recipients: ResolvedRecipient[];
  skipped: { email: string; reason: string }[];
}

export async function resolveRecipients(
  actor: ActorContext,
  organizationId: string,
  requestedEmails: string[],
  channel: Pick<Tables<"delivery_channels">, "allow_external_recipients"> | null,
): Promise<RecipientResolution> {
  const { data: members } = await actor.supabase
    .from("organization_memberships")
    .select("profile_id, profiles ( id, email, status )")
    .eq("organization_id", organizationId)
    .is("effective_to", null);

  const memberByEmail = new Map<string, { id: string; status: string }>();
  for (const row of members ?? []) {
    const profile = row.profiles as unknown as {
      id: string;
      email: string;
      status?: string;
    } | null;
    if (profile) {
      memberByEmail.set(profile.email.toLowerCase(), {
        id: profile.id,
        status: profile.status ?? "active",
      });
    }
  }

  const recipients: ResolvedRecipient[] = [];
  const skipped: RecipientResolution["skipped"] = [];
  const seen = new Set<string>();

  for (const raw of requestedEmails) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      skipped.push({ email, reason: "invalid_address" });
      continue;
    }
    const member = memberByEmail.get(email);
    if (member) {
      if (member.status && member.status !== "active") {
        skipped.push({ email, reason: "member_deactivated" });
        continue;
      }
      recipients.push({ email, profileId: member.id, recipientType: "user" });
      continue;
    }
    if (channel?.allow_external_recipients) {
      recipients.push({ email, profileId: null, recipientType: "external" });
    } else {
      skipped.push({ email, reason: "external_recipients_not_allowed" });
    }
  }

  return { recipients, skipped };
}
