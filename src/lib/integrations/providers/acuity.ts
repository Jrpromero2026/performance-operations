/**
 * Acuity Scheduling provider adapter — BLOCKED skeleton.
 *
 * Official docs inspected 2026-07-29 (docs/ACUITY_API_FINDINGS.md).
 * Verified contract: HTTP Basic auth (numeric User ID + API key),
 * GET /api/v1/appointments with minDate/maxDate/calendarID/canceled/
 * showall/max (default 100, date-window pagination), calendars /
 * appointment-types / clients endpoints, and webhooks (scheduled /
 * rescheduled / canceled / changed) signed with base64 HMAC-SHA256 of
 * the raw body using the API key (x-acuity-signature).
 *
 * Blocked because: no account credentials and no representative sample
 * data — status semantics, identifier stability, calendar↔trainer and
 * appointment-type↔service models are unconfirmed for this business
 * (the Phase 3 blocker persists). Generic CSV mapping remains the
 * supported Acuity fallback.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NormalizeResult, SourceAdapter } from "@/lib/imports/types";
import {
  ProviderBlockedError,
  type ConnectionValidation,
  type ProviderAdapter,
  type ProviderCapabilities,
  type WebhookVerification,
} from "../shared/contract";

const BLOCKED_REASONS = [
  "No Acuity account credentials are available (numeric User ID + API key).",
  "No representative sample data has ever been provided — the Phase 3 blocker persists.",
  "Status semantics, appointment-identifier stability across reschedules, the calendar↔trainer model, and the appointment-type↔service model are unconfirmed for this business.",
];

const SETUP_CHECKLIST = [
  "Obtain the organization's Acuity User ID and API key (Integrations → API).",
  "Store the credential via the connection credential form (never in files or code).",
  "Export or fetch representative appointment data covering completed, cancelled, and rescheduled cases.",
  "Confirm the calendar↔trainer mapping and appointment-type↔service mapping with the business.",
  "Verify appointment id stability across reschedules and the canceled-flag semantics.",
  "Update docs/ACUITY_API_FINDINGS.md with verified shapes, then implement acuity-api-v1 (the endpoint/auth/webhook contract is already documented and ready).",
];

function blocked(): never {
  throw new ProviderBlockedError("acuity_api", BLOCKED_REASONS);
}

const importAdapter: SourceAdapter = {
  source: "acuity",
  version: "acuity-api-v1-unimplemented",
  displayName: "Acuity API (blocked)",
  requiredHeaders: [],
  optionalHeaders: [],
  detect: () => 0,
  normalizeRow: (): NormalizeResult => {
    blocked();
  },
};

/**
 * Webhook signature verification IS implemented — the mechanism is
 * fully documented (base64 HMAC-SHA256 of the raw body with the API key
 * as secret, x-acuity-signature header) and safe to verify against
 * synthetic vectors without an account. Everything else stays blocked.
 */
export function verifyAcuitySignature(args: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string | null;
}): WebhookVerification {
  if (!args.secret) return { valid: false, reason: "no_secret_configured" };
  if (!args.signatureHeader) return { valid: false, reason: "missing_signature" };
  const expected = createHmac("sha256", args.secret)
    .update(args.rawBody, "utf8")
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(args.signatureHeader);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "signature_mismatch" };
  }
  return { valid: true };
}

export const acuityAdapter: ProviderAdapter = {
  key: "acuity_api",
  displayName: "Acuity Scheduling (API)",
  adapterVersion: "blocked",
  status: "blocked",
  blockedReasons: BLOCKED_REASONS,
  setupChecklist: SETUP_CHECKLIST,

  getCapabilities(): ProviderCapabilities {
    return {
      appointmentsByDate: true,
      incrementalSync: false, // no modified-since; canceled visible via flag
      cursorPagination: false, // max + date windows only
      maxPageSize: 100,
      staff: true, // calendars
      services: true, // appointment-types
      clients: true,
      webhooks: true,
      notes: [
        "Rate limits undocumented (rate-limits page unavailable) — handled generically via 429/Retry-After.",
        "Webhook payloads are thin notifications; records must be re-fetched via the API.",
        "No webhook timestamp/replay protection documented — replay defense is our event-id idempotency.",
      ],
    };
  },

  async validateConnection(): Promise<ConnectionValidation> {
    return {
      ok: false,
      failureCode: "provider_blocked",
      message:
        "Acuity API integration is blocked pending credentials and representative data — see the setup checklist. Generic CSV mapping remains supported.",
    };
  },

  async healthCheck(): Promise<ConnectionValidation> {
    return this.validateConnection({} as never);
  },

  normalizeSourceRecord(): NormalizeResult {
    blocked();
  },

  evidenceColumns: [],
  toEvidenceRow(): Record<string, string> {
    blocked();
  },
  importAdapter,

  verifyWebhook: (args) =>
    verifyAcuitySignature({
      rawBody: args.rawBody,
      signatureHeader: args.signatureHeader,
      secret: args.secret,
    }),
};
