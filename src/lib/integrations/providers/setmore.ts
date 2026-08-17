/**
 * Setmore provider adapter.
 *
 * Phase G status: the TRANSPORT IS IMPLEMENTED (OAuth2 refresh→access
 * exchange, cursor-paginated appointments/staff/services/customers) and
 * routes through the ONE canonical Setmore normalizer shared with the
 * historical CSV path. What is NOT done — and cannot be done from this
 * repository — is live verification against a real Setmore account.
 *
 * That distinction is the whole point of the gate below. Rather than
 * declaring the provider "available" on the strength of documentation,
 * the adapter stays fail-closed until an operator completes the live
 * verification checklist and `SETMORE_API_LIVE_VERIFIED` is deliberately
 * flipped in code (a reviewed change, not a runtime toggle). Until then
 * every network-facing method throws ProviderBlockedError, the sync
 * engine refuses to run, and manual CSV import remains the supported
 * Setmore path.
 */

import type { NormalizeResult, SourceAdapter } from "@/lib/imports/types";
import {
  normalizeSetmoreRecord,
  type SetmoreCostUnit,
} from "@/lib/sources/setmore/canonical";
import {
  setmoreApiAppointmentToCanonical,
  type SetmoreApiAppointment,
} from "@/lib/sources/setmore/api-fields";
import {
  exchangeRefreshToken,
  fetchAppointmentsPage,
  fetchServices,
  fetchStaffPage,
  getAccessToken,
  SETMORE_MAX_APPOINTMENT_PAGE,
} from "@/lib/sources/setmore/api-client";
import {
  ProviderBlockedError,
  type ConnectionValidation,
  type FetchContext,
  type ProviderAdapter,
  type ProviderCapabilities,
  type ProviderPage,
  type ProviderRecord,
} from "../shared/contract";

/**
 * THE GATE. Flip to `true` only after every item in
 * SETMORE_LIVE_VERIFICATION_CHECKLIST has been completed against a real
 * account and docs/SETMORE_API_FINDINGS.md records the verified shapes
 * and the date. Flipping this without that evidence would let unverified
 * status and cost semantics reach the ledger.
 */
export const SETMORE_API_LIVE_VERIFIED = false;

/**
 * Reasons the provider is still blocked. These are CREDENTIAL- and
 * EVIDENCE-dependent, not implementation gaps: the code paths exist.
 */
/**
 * What is STILL blocking, as of the live probes on 2026-08-17.
 *
 * Two earlier reasons are resolved and deliberately removed: the account
 * has now been exercised, and the cost unit is verified as dollars and
 * declared on the connection. Leaving settled items here would misstate
 * what actually remains.
 */
const BLOCKED_REASONS = [
  "API/CSV reconciliation has not been run. It is unproven that an API appointment `key` equals the CSV `Booking ID` for the same appointment — if they differ, every record reconciles as API_ONLY/CSV_ONLY and no API data can be trusted to align with history.",
  "CONFIRMED LIVE: the API exposes no appointment status field (only a free-form `label`, observed as 'No Label'/'No label'/'no label'). Every API-sourced appointment lands as `unknown`, so an API-only ingest reports zero completed sessions and zero revenue. The CSV export remains authoritative for status.",
  "CONFIRMED LIVE: GET /services returns only 5 services while appointments reference 19 distinct service keys, so historical service NAMES are unavailable via the API and must come from the CSV export.",
  "Occurrence identity is unresolved: 250 consecutive appointments spanned under three days, which cannot reveal a weekly recurring series. Identity is (key + start instant), which is correct under both readings, but the reconciliation report must confirm it.",
];

export const SETMORE_LIVE_VERIFICATION_CHECKLIST = [
  "Confirm the organization's Setmore account is on the Pro tier.",
  "Email api@setmore.com (name, registered account email, use case) and obtain the beta refresh token.",
  "Store the refresh token via the connection credential form (Vault-backed, server-only — never in files, code, or .env).",
  "Run a bounded read against one known day and capture the raw payloads for: a completed appointment, a cancelled appointment, and one occurrence of a recurring series.",
  "Determine whether the API represents status at all. If it does not, keep the hybrid CSV-for-status strategy; do NOT infer status from `label`.",
  "Verify whether the appointment `key` is occurrence-unique or series-level by comparing a recurring series against the CSV export for the same period.",
  "Verify the cost unit against a known appointment price, then declare it on the connection config (`cost_unit`).",
  "Run the API/CSV reconciliation report for one full historical month and review every MISMATCH and API_ONLY/CSV_ONLY row.",
  "Update docs/SETMORE_API_FINDINGS.md with the verified shapes and the verification date, then flip SETMORE_API_LIVE_VERIFIED.",
];

function blocked(): never {
  throw new ProviderBlockedError("setmore_api", BLOCKED_REASONS);
}

function assertLive(): void {
  if (!SETMORE_API_LIVE_VERIFIED) blocked();
}

/** Read the operator-declared cost unit from non-secret connection config. */
export function resolveCostUnit(config: Record<string, unknown>): SetmoreCostUnit {
  const raw = config.cost_unit;
  return raw === "cents" || raw === "dollars" ? raw : "unverified";
}

/** Read the organization timezone the connection was configured with. */
function resolveTimezone(config: Record<string, unknown>): string {
  const raw = config.organization_timezone;
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : "UTC";
}

/* ------------------------------------------------------------ evidence */

const EVIDENCE_COLUMNS = [
  "key",
  "start_time",
  "end_time",
  "duration",
  "staff_key",
  "service_key",
  "customer_key",
  "cost",
  "currency",
  "label",
  "comment",
];

/* ------------------------------------------------------------- adapter */

/**
 * Import staging adapter for the evidence CSV the sync engine builds
 * from fetched records. It parses the evidence columns back into the
 * SAME canonical record the live payload produced, so an API sync and a
 * replay of its evidence file normalize identically.
 */
const importAdapter: SourceAdapter = {
  source: "setmore",
  version: "setmore-api-v1",
  displayName: "Setmore API (v1)",
  requiredHeaders: ["key", "start_time"],
  optionalHeaders: EVIDENCE_COLUMNS.filter((c) => c !== "key" && c !== "start_time"),

  detect(headers: string[]): number {
    const set = new Set(headers.map((h) => h.trim()));
    if (!set.has("key") || !set.has("start_time")) return 0;
    const hits = EVIDENCE_COLUMNS.filter((h) => set.has(h)).length;
    return Math.min(1, 0.8 + hits / (EVIDENCE_COLUMNS.length * 5));
  },

  normalizeRow(row, ctx): NormalizeResult {
    const appointment: SetmoreApiAppointment = {};
    for (const column of EVIDENCE_COLUMNS) {
      const value = row[column];
      if (value !== undefined && value !== "") appointment[column] = value;
    }
    return normalizeSetmoreRecord(setmoreApiAppointmentToCanonical(appointment), {
      organizationTimezone: ctx.organizationTimezone,
      apiCostUnit: resolveCostUnit(ctx.sourceConfig ?? {}),
    });
  },
};

export const setmoreAdapter: ProviderAdapter = {
  key: "setmore_api",
  displayName: "Setmore (API)",
  adapterVersion: SETMORE_API_LIVE_VERIFIED ? "setmore-api-v1" : "setmore-api-v1-unverified",
  status: SETMORE_API_LIVE_VERIFIED ? "available" : "blocked",
  blockedReasons: SETMORE_API_LIVE_VERIFIED ? [] : BLOCKED_REASONS,
  setupChecklist: SETMORE_LIVE_VERIFICATION_CHECKLIST,

  getCapabilities(): ProviderCapabilities {
    // Verified from official docs — recorded even while blocked so the
    // capability matrix is honest about what WOULD be available.
    return {
      appointmentsByDate: true,
      incrementalSync: false, // no modified-since documented
      cursorPagination: true,
      maxPageSize: SETMORE_MAX_APPOINTMENT_PAGE,
      staff: true,
      services: true,
      clients: false, // name/email/phone search only — no enumeration
      webhooks: false, // none documented
      notes: [
        "NO appointment status field: API-sourced appointments land as `unknown` and are never counted as completed or revenue-bearing.",
        "Cost unit (cents vs dollars) must be declared per connection after live verification; until then cost is evidence only.",
        "Page size is 50, not the documented 150, and the `limit` parameter is ignored (verified live 2026-08-17). A one-month backfill is ~58 requests.",
        "Access tokens last ~2 hours, not the documented ~7 days (verified live 2026-08-17).",
        "GET /services does not return historical/archived services: 19 service keys were in use against 5 catalogued. Service NAMES come from the CSV export.",
        "Rate limits unspecified in official docs (monitored per-minute); limits are read from response headers when present.",
        "No sandbox: all API requests run against live accounts, so this transport is read-only.",
      ],
    };
  },

  async validateConnection(ctx: FetchContext): Promise<ConnectionValidation> {
    if (!SETMORE_API_LIVE_VERIFIED) {
      return {
        ok: false,
        failureCode: "provider_blocked",
        message:
          "Setmore API integration is implemented but not live-verified — complete the verification checklist before activating. Manual CSV import remains supported.",
        capabilities: this.getCapabilities(),
      };
    }
    // Credential validity is proven by an actual token exchange; no
    // credential value is echoed back into the result.
    await exchangeRefreshToken(ctx.secret ?? "");
    return {
      ok: true,
      message: "Setmore credential accepted; access token issued.",
      capabilities: this.getCapabilities(),
    };
  },

  async healthCheck(ctx: FetchContext): Promise<ConnectionValidation> {
    return this.validateConnection(ctx);
  },

  async fetchAppointments(ctx: FetchContext): Promise<ProviderPage> {
    assertLive();
    // Cached: the sync engine calls this once PER PAGE, so minting a token
    // per call would mean one OAuth round-trip per 150 appointments.
    const token = await getAccessToken(ctx.secret ?? "");
    const page = await fetchAppointmentsPage(token, {
      startDate: ctx.window.startDate,
      endDate: ctx.window.endDate,
      cursor: ctx.cursor,
      limit: Math.min(ctx.pageLimit, SETMORE_MAX_APPOINTMENT_PAGE),
      customerDetails: true,
    });

    const records: ProviderRecord[] = page.items.map((item) => ({
      externalId: typeof item.key === "string" ? item.key : "",
      // Setmore documents no modified-since/updated field.
      sourceUpdatedAt: null,
      payload: item,
    }));

    return { records, nextCursor: page.nextCursor, rateLimit: page.rateLimit };
  },

  normalizeSourceRecord(record, ctx): NormalizeResult {
    // Same canonical layer as the CSV path — no API-specific business rules.
    return normalizeSetmoreRecord(
      setmoreApiAppointmentToCanonical(record.payload as SetmoreApiAppointment),
      {
        organizationTimezone: ctx.organizationTimezone,
        apiCostUnit: resolveCostUnit(ctx.sourceConfig ?? {}),
      }
    );
  },

  evidenceColumns: EVIDENCE_COLUMNS,

  toEvidenceRow(record: ProviderRecord): Record<string, string> {
    const payload = record.payload as Record<string, unknown>;
    const row: Record<string, string> = {};
    for (const column of EVIDENCE_COLUMNS) {
      const value = payload[column];
      row[column] =
        typeof value === "string"
          ? value
          : typeof value === "number" || typeof value === "boolean"
            ? String(value)
            : "";
    }
    return row;
  },

  importAdapter,
};

/**
 * Discover the Setmore staff roster and service catalogue for
 * reconciliation against internal trainers and services. Separate from
 * the appointment sync because it feeds identity mapping, not the ledger.
 */
export async function fetchSetmoreDirectories(ctx: FetchContext): Promise<{
  staff: Record<string, unknown>[];
  services: Record<string, unknown>[];
}> {
  assertLive();
  const token = await getAccessToken(ctx.secret ?? "");
  const staff: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  // Bounded: the documented staff page size is 50 and no real roster
  // approaches 20 pages; an unbounded loop on an undocumented cursor is
  // how integrations hang.
  for (let page = 0; page < 20; page++) {
    const result = await fetchStaffPage(token, { cursor });
    staff.push(...result.items);
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  const services = await fetchServices(token);
  return { staff, services: services.items };
}

/** Exported for the timezone-dependent evidence replay path. */
export { resolveTimezone };
