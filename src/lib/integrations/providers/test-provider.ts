/**
 * Test provider — a fully synthetic, deterministic provider used ONLY to
 * verify the integration framework (connection lifecycle, sync engine,
 * jobs, webhooks). It is never presented as a real external system: no
 * network I/O occurs; "pages" are generated locally from a seed.
 *
 * Failure modes are simulated through the stored credential so every
 * classified path is exercisable end-to-end:
 *   secret starts with "test_"        → valid credential
 *   secret starts with "fail_auth"    → authentication_failed
 *   secret starts with "fail_rate"    → rate_limited (with Retry-After)
 *   secret starts with "fail_outage"  → provider_unavailable (retryable)
 *   secret starts with "fail_drift"   → schema drift in fetched records
 * Connection config (non-secret): { record_count?, start_date?, days? }.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NormalizeResult, SourceAdapter } from "@/lib/imports/types";
import { IntegrationFailure } from "../shared/failures";
import type {
  ConnectionValidation,
  FetchContext,
  ParsedWebhookEvent,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderPage,
  ProviderRecord,
  WebhookVerification,
} from "../shared/contract";

const PAGE_SIZE = 25;

/** Deterministic LCG so identical inputs always produce identical pages. */
function lcg(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

const STATUSES = ["completed", "completed", "completed", "cancelled", "no_show"];
const CLIENTS = ["Test Client A", "Test Client B", "Test Client C", "Test Client D"];

export interface TestProviderConfig {
  recordCount: number;
  startDate: string;
  days: number;
}

export function resolveTestConfig(config: Record<string, unknown>): TestProviderConfig {
  const recordCount = Number(config.record_count ?? 6);
  return {
    recordCount: Number.isInteger(recordCount) && recordCount >= 0 && recordCount <= 500 ? recordCount : 6,
    startDate: typeof config.start_date === "string" ? config.start_date : "2099-07-01",
    days: Number.isInteger(Number(config.days ?? 5)) ? Number(config.days ?? 5) : 5,
  };
}

function checkSecret(secret: string | null): void {
  if (!secret) {
    throw new IntegrationFailure("authentication_failed", "No credential stored for the test provider.");
  }
  if (secret.startsWith("fail_auth")) {
    throw new IntegrationFailure("authentication_failed", "Test provider rejected the credential (simulated).");
  }
  if (secret.startsWith("fail_outage")) {
    throw new IntegrationFailure("provider_unavailable", "Test provider outage (simulated 503).");
  }
  if (!secret.startsWith("test_") && !secret.startsWith("fail_")) {
    throw new IntegrationFailure("authentication_failed", "Test provider credentials must start with test_.");
  }
}

/** Generate the full deterministic record set for a connection window. */
export function generateTestRecords(
  config: TestProviderConfig,
  connectionSeedText: string,
  drift: boolean,
): ProviderRecord[] {
  let seed = 0;
  for (const ch of connectionSeedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const random = lcg(seed || 7);
  const start = new Date(`${config.startDate}T00:00:00Z`);
  const records: ProviderRecord[] = [];
  for (let i = 0; i < config.recordCount; i++) {
    const dayOffset = i % Math.max(1, config.days);
    const date = new Date(start.getTime() + dayOffset * 86_400_000);
    const isoDate = date.toISOString().slice(0, 10);
    const hour = 8 + (i % 9);
    const status = STATUSES[Math.floor(random() * STATUSES.length)]!;
    const payload: Record<string, unknown> = {
      id: `tp-${isoDate}-${String(i).padStart(3, "0")}`,
      date: isoDate,
      start_time: `${String(hour).padStart(2, "0")}:00`,
      end_time: `${String(hour + 1).padStart(2, "0")}:00`,
      staff_name: "Payton E2E Payroll",
      service_name: "E2E Signature 60",
      client_name: CLIENTS[i % CLIENTS.length]!,
      status,
      price_cents: 6400,
      updated_at: `${isoDate}T00:30:00Z`,
    };
    if (drift) {
      // Simulated upstream change: required field renamed + type change.
      delete payload.status;
      payload.appointment_state = status;
      payload.price_cents = String(payload.price_cents);
    }
    records.push({
      externalId: String(payload.id),
      sourceUpdatedAt: String(payload.updated_at),
      payload,
    });
  }
  return records;
}

export const TEST_EXPECTED_FIELDS = [
  { name: "id", required: true, type: "string" as const },
  { name: "date", required: true, type: "string" as const },
  { name: "start_time", required: true, type: "string" as const },
  { name: "end_time", required: true, type: "string" as const },
  { name: "staff_name", required: true, type: "string" as const },
  { name: "service_name", required: true, type: "string" as const },
  { name: "client_name", required: false, type: "string" as const },
  { name: "status", required: true, type: "string" as const },
  { name: "price_cents", required: false, type: "number" as const },
  { name: "updated_at", required: false, type: "string" as const },
];

const EVIDENCE_COLUMNS = [
  "External ID",
  "Date",
  "Start",
  "End",
  "Staff",
  "Service",
  "Client",
  "Status",
  "Price Cents",
  "Updated At",
];

/** Import staging adapter for evidence CSVs built from test records. */
const importAdapter: SourceAdapter = {
  source: "integration_test",
  version: "test-v1",
  displayName: "Test Provider (synthetic)",
  requiredHeaders: EVIDENCE_COLUMNS.slice(0, 8),
  optionalHeaders: EVIDENCE_COLUMNS.slice(8),
  detect: (headers) =>
    EVIDENCE_COLUMNS.every((c) => headers.includes(c)) ? 1 : 0,
  normalizeRow(row, ctx): NormalizeResult {
    const issues: NormalizeResult["issues"] = [];
    const date = row["Date"] ?? "";
    const start = row["Start"] ?? "";
    const end = row["End"] ?? "";
    const price = row["Price Cents"] ?? "";
    const priceCents = /^\d+$/.test(price) ? Number(price) : undefined;
    if (price !== "" && priceCents === undefined) {
      issues.push({
        code: "invalid_price",
        severity: "warning",
        field: "Price Cents",
        message: "Price is not an integer cents value.",
      });
    }
    return {
      normalized: {
        externalAppointmentId: row["External ID"] || undefined,
        appointmentDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
        startAt: date && start ? `${date}T${start}:00Z` : undefined,
        endAt: date && end ? `${date}T${end}:00Z` : undefined,
        durationMinutes: 60,
        timezone: ctx.organizationTimezone,
        sourceTrainerName: row["Staff"] || undefined,
        sourceServiceName: row["Service"] || undefined,
        sourceClientName: row["Client"] || undefined,
        sourceStatus: row["Status"] || undefined,
        listedPriceCents: priceCents,
        currency: "USD",
        sourceUpdatedAt: row["Updated At"] || undefined,
      },
      issues,
    };
  },
};

export const testProviderAdapter: ProviderAdapter = {
  key: "test_provider",
  displayName: "Test Provider (synthetic)",
  adapterVersion: "test-v1",
  status: "available",
  blockedReasons: [],
  setupChecklist: [
    "Store any credential starting with test_ (synthetic).",
    "Optionally set record_count / start_date in the connection config.",
  ],

  getCapabilities(): ProviderCapabilities {
    return {
      appointmentsByDate: true,
      incrementalSync: true,
      cursorPagination: true,
      maxPageSize: PAGE_SIZE,
      staff: false,
      services: false,
      clients: false,
      webhooks: true,
      notes: ["Synthetic framework-verification provider. Not an external system."],
    };
  },

  async validateConnection(ctx: FetchContext): Promise<ConnectionValidation> {
    try {
      checkSecret(ctx.secret);
    } catch (error) {
      if (error instanceof IntegrationFailure) {
        return { ok: false, failureCode: error.code, message: error.message };
      }
      throw error;
    }
    return {
      ok: true,
      message: "Test provider credential accepted (synthetic).",
      capabilities: this.getCapabilities(),
    };
  },

  async healthCheck(ctx: FetchContext): Promise<ConnectionValidation> {
    return this.validateConnection(ctx);
  },

  async fetchAppointments(ctx: FetchContext): Promise<ProviderPage> {
    checkSecret(ctx.secret);
    if (ctx.secret!.startsWith("fail_rate") && ctx.cursor === null) {
      // The very first request throttles once (Retry-After 1s); the retry
      // with the explicit "0" cursor succeeds — exercises rate-limit
      // handling without infinite loops (the provider is stateless).
      return {
        records: [],
        nextCursor: "0",
        rateLimit: { remaining: 0, resetAt: null, retryAfterSeconds: 1, throttled: true },
      };
    }
    const drift = ctx.secret!.startsWith("fail_drift");
    const config = resolveTestConfig(ctx.config);
    const all = generateTestRecords(config, ctx.connectionId, drift).filter(
      (r) =>
        String(r.payload.date) >= ctx.window.startDate &&
        String(r.payload.date) <= ctx.window.endDate,
    );
    const page = Number(ctx.cursor ?? "0");
    if (!Number.isInteger(page) || page < 0) {
      throw new IntegrationFailure("invalid_response", "Unparseable cursor for the test provider.");
    }
    const pageSize = Math.min(ctx.pageLimit, PAGE_SIZE);
    const slice = all.slice(page * pageSize, (page + 1) * pageSize);
    const hasMore = (page + 1) * pageSize < all.length;
    return {
      records: slice,
      nextCursor: hasMore ? String(page + 1) : null,
      rateLimit: { remaining: 100, resetAt: null, retryAfterSeconds: null, throttled: false },
    };
  },

  async fetchChangedAppointments(ctx: FetchContext, since: string): Promise<ProviderPage> {
    const page = await this.fetchAppointments!(ctx);
    return {
      ...page,
      records: page.records.filter(
        (r) => r.sourceUpdatedAt !== null && r.sourceUpdatedAt > since,
      ),
    };
  },

  normalizeSourceRecord(record, ctx): NormalizeResult {
    return importAdapter.normalizeRow(this.toEvidenceRow(record), {
      organizationTimezone: ctx.organizationTimezone,
    });
  },

  evidenceColumns: EVIDENCE_COLUMNS,
  toEvidenceRow(record: ProviderRecord): Record<string, string> {
    const p = record.payload;
    return {
      "External ID": String(p.id ?? record.externalId),
      Date: String(p.date ?? ""),
      Start: String(p.start_time ?? ""),
      End: String(p.end_time ?? ""),
      Staff: String(p.staff_name ?? ""),
      Service: String(p.service_name ?? ""),
      Client: String(p.client_name ?? ""),
      Status: String(p.status ?? p.appointment_state ?? ""),
      "Price Cents": p.price_cents === undefined ? "" : String(p.price_cents),
      "Updated At": String(p.updated_at ?? ""),
    };
  },
  importAdapter,

  verifyWebhook(args): WebhookVerification {
    if (!args.secret) return { valid: false, reason: "no_secret_configured" };
    if (!args.signatureHeader) return { valid: false, reason: "missing_signature" };
    if (args.timestampHeader) {
      const ts = Date.parse(args.timestampHeader);
      if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60_000) {
        return { valid: false, reason: "timestamp_out_of_window" };
      }
    }
    const expected = createHmac("sha256", args.secret)
      .update(args.rawBody, "utf8")
      .digest("base64");
    const a = Buffer.from(expected);
    const b = Buffer.from(args.signatureHeader);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: "signature_mismatch" };
    }
    return { valid: true };
  },

  parseWebhook(rawBody, contentType): ParsedWebhookEvent | null {
    if (!contentType.includes("application/json")) return null;
    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      if (typeof parsed.event_id !== "string" || typeof parsed.action !== "string") {
        return null;
      }
      return {
        providerEventId: parsed.event_id,
        eventType: parsed.action,
        payload: { action: parsed.action, record_id: parsed.record_id ?? null },
      };
    } catch {
      return null;
    }
  },
};
