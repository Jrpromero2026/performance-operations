/**
 * Setmore provider adapter — BLOCKED skeleton.
 *
 * Official docs inspected 2026-07-29 (docs/SETMORE_API_FINDINGS.md).
 * The API contract that IS verified: OAuth2 refresh→access token
 * exchange, GET /bookingapi/appointments by dd-mm-yyyy date range with
 * cursor pagination (max 150), staff/services endpoints. What blocks a
 * native implementation: no credentials (limited-beta application
 * required), NO documented appointment status field, unverified
 * recurring-occurrence identity, ambiguous cost unit.
 *
 * Every network-facing method fails closed with ProviderBlockedError.
 * Manual CSV import (Phase 3 setmore-csv adapter) remains the supported
 * Setmore path.
 */

import type { NormalizeResult, SourceAdapter } from "@/lib/imports/types";
import {
  ProviderBlockedError,
  type ConnectionValidation,
  type ProviderAdapter,
  type ProviderCapabilities,
  type ProviderRecord,
} from "../shared/contract";

const BLOCKED_REASONS = [
  "No credentials: Setmore API access is a limited beta requiring an approved application (api@setmore.com) from the organization's Pro account.",
  "The documented appointment payload has NO status field (free-form label only) — canonical completed/cancelled/no-show mapping is unverifiable.",
  "Recurring-series occurrence identity is unverified: Phase 3 established from real CSV exports that Setmore Booking IDs identify SERIES, and the API docs never address recurrence.",
  "Cost unit (cents vs dollars) is ambiguous across official examples.",
];

const SETUP_CHECKLIST = [
  "Confirm the organization's Setmore account is on the Pro tier.",
  "Email api@setmore.com (name, registered account email, use case) and obtain the beta refresh token.",
  "Store the refresh token via the connection credential form (never in files or code).",
  "Capture real API appointment payloads covering: a completed appointment, a cancelled appointment, and a recurring series — verify status representation and occurrence identity.",
  "Verify the cost unit against known appointment prices.",
  "Update docs/SETMORE_API_FINDINGS.md with the verified shapes and dates, then implement setmore-api-v1 against them.",
];

function blocked(): never {
  throw new ProviderBlockedError("setmore_api", BLOCKED_REASONS);
}

/** Import staging adapter placeholder — unreachable while blocked. */
const importAdapter: SourceAdapter = {
  source: "setmore",
  version: "setmore-api-v1-unimplemented",
  displayName: "Setmore API (blocked)",
  requiredHeaders: [],
  optionalHeaders: [],
  detect: () => 0,
  normalizeRow: (): NormalizeResult => {
    blocked();
  },
};

export const setmoreAdapter: ProviderAdapter = {
  key: "setmore_api",
  displayName: "Setmore (API)",
  adapterVersion: "blocked",
  status: "blocked",
  blockedReasons: BLOCKED_REASONS,
  setupChecklist: SETUP_CHECKLIST,

  getCapabilities(): ProviderCapabilities {
    // Verified from official docs — recorded even while blocked so the
    // capability matrix is honest about what WOULD be available.
    return {
      appointmentsByDate: true,
      incrementalSync: false, // no modified-since documented
      cursorPagination: true,
      maxPageSize: 150,
      staff: true,
      services: true,
      clients: false, // name-keyed search only
      webhooks: false, // none documented
      notes: [
        "Rate limits unspecified in official docs (monitored per-minute).",
        "No sandbox: all API requests run against live accounts.",
        "Access token lifetime ≈ 7 days (expires_in 604799).",
      ],
    };
  },

  async validateConnection(): Promise<ConnectionValidation> {
    return {
      ok: false,
      failureCode: "provider_blocked",
      message:
        "Setmore API integration is blocked pending credentials and payload verification — see the setup checklist. Manual CSV import remains supported.",
    };
  },

  async healthCheck(): Promise<ConnectionValidation> {
    return this.validateConnection({} as never);
  },

  normalizeSourceRecord(): NormalizeResult {
    blocked();
  },

  evidenceColumns: [],
  toEvidenceRow(_record: ProviderRecord): Record<string, string> {
    blocked();
  },
  importAdapter,
};
