/**
 * Provider-neutral email delivery abstraction.
 *
 * NO real email provider is configured or claimed (unresolved business
 * decision: Resend / Postmark / SES / org SMTP — see DECISION_LOG.md).
 * The only executable provider is the TEST provider, which never leaves
 * the system: it records the send and reports acceptance, and its
 * channel is explicitly `test_mode`. `none_configured` fails closed with
 * delivery_not_configured.
 *
 * State honesty: without provider-level delivery confirmation we never
 * claim `delivered`. The test provider ends at `accepted`; real
 * providers would advance through provider callbacks in a future phase.
 */

import type { Tables } from "@/lib/supabase/types";
import { IntegrationFailure } from "../shared/failures";

export interface DeliveryMessage {
  to: string;
  subject: string;
  bodyText: string;
  /** Safe deep link into the app (no signed data, no amounts). */
  linkPath: string | null;
  /** Attachment is optional; oversized artifacts fall back to the link. */
  attachment: { fileName: string; content: string; mimeType: string } | null;
}

export interface DeliveryOutcome {
  accepted: boolean;
  /** Honest terminal-ish state for the event row. */
  state: "accepted" | "rejected" | "failed";
  providerMessageId: string | null;
  error: string | null;
  retryable: boolean;
}

export interface EmailDeliveryProvider {
  key: string;
  send(message: DeliveryMessage): Promise<DeliveryOutcome>;
}

/** Attachments above this size fall back to a deep link (no signed URLs yet). */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/**
 * Test provider: accepts every structurally-valid message without any
 * network I/O. Used to verify the delivery pipeline in dev/e2e.
 */
export class TestDeliveryProvider implements EmailDeliveryProvider {
  key = "test";
  async send(message: DeliveryMessage): Promise<DeliveryOutcome> {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(message.to)) {
      return {
        accepted: false,
        state: "rejected",
        providerMessageId: null,
        error: "invalid_recipient_address",
        retryable: false,
      };
    }
    if (message.to.endsWith("@reject.test")) {
      // Deterministic rejection hook for tests.
      return {
        accepted: false,
        state: "rejected",
        providerMessageId: null,
        error: "recipient_rejected_by_test_provider",
        retryable: false,
      };
    }
    if (message.to.endsWith("@defer.test")) {
      return {
        accepted: false,
        state: "failed",
        providerMessageId: null,
        error: "temporary_deferral_by_test_provider",
        retryable: true,
      };
    }
    return {
      accepted: true,
      state: "accepted",
      providerMessageId: `test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      error: null,
      retryable: false,
    };
  }
}

export function resolveDeliveryProvider(
  channel: Pick<Tables<"delivery_channels">, "provider" | "status"> | null,
): EmailDeliveryProvider {
  if (!channel || channel.provider === "none_configured" || channel.status === "unconfigured") {
    throw new IntegrationFailure(
      "delivery_not_configured",
      "No email delivery provider is configured for this organization.",
    );
  }
  if (channel.status === "disabled") {
    throw new IntegrationFailure(
      "delivery_not_configured",
      "The organization's email delivery channel is disabled.",
    );
  }
  if (channel.provider === "test") {
    return new TestDeliveryProvider();
  }
  // Real providers (resend/postmark/ses/smtp) require configuration +
  // credentials that do not exist yet — fail closed, never simulate.
  throw new IntegrationFailure(
    "delivery_not_configured",
    `Email provider '${channel.provider}' is declared but not implemented/configured in this phase.`,
  );
}

/** Subjects must never carry amounts or sensitive payroll figures. */
export function safeSubject(base: string, periodLabel: string): string {
  return `${base} — ${periodLabel}`.slice(0, 150);
}
