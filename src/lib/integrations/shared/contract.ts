/**
 * Provider adapter contract — the ONLY surface through which the
 * application talks to an external scheduling system. Adapters expose
 * typed, provider-neutral structures; provider-specific payload shapes
 * never leak past `normalizeSourceRecord`.
 *
 * Capabilities are EXPLICIT: an adapter declares what it supports, and
 * the sync engine refuses operations the capability matrix does not
 * claim. Blocked providers (no verified API contract / no credentials)
 * throw `ProviderBlockedError` from every network-facing method.
 */

import type { NormalizeResult, SourceAdapter } from "@/lib/imports/types";

export type ProviderKey = "setmore_api" | "acuity_api" | "test_provider";

export interface ProviderCapabilities {
  /** Free-form verified matrix (mirrors integration_providers.capabilities). */
  appointmentsByDate: boolean;
  incrementalSync: boolean;
  cursorPagination: boolean;
  maxPageSize: number | null;
  staff: boolean;
  services: boolean;
  clients: boolean;
  webhooks: boolean;
  /** Human-readable notes for capabilities that are partial/unverified. */
  notes: string[];
}

/** One provider record fetched from a page: raw payload + identity. */
export interface ProviderRecord {
  externalId: string;
  /** Provider-declared last-modified instant, when the provider exposes one. */
  sourceUpdatedAt: string | null;
  /** Raw provider payload, preserved verbatim as immutable evidence. */
  payload: Record<string, unknown>;
}

export interface ProviderPage {
  records: ProviderRecord[];
  /** Opaque cursor for the next page; null = no more pages. */
  nextCursor: string | null;
  /** Rate-limit signals observed on this response (absent if none). */
  rateLimit?: RateLimitObservation;
}

export interface RateLimitObservation {
  remaining: number | null;
  resetAt: string | null;
  retryAfterSeconds: number | null;
  throttled: boolean;
}

export interface FetchWindow {
  startDate: string; // ISO date, inclusive
  endDate: string; // ISO date, inclusive
}

export interface FetchContext {
  connectionId: string;
  organizationId: string;
  window: FetchWindow;
  cursor: string | null;
  /**
   * Provider credential, resolved server-side ONLY (Vault). Blocked and
   * test providers receive whatever was stored; adapters must never log
   * or echo it.
   */
  secret: string | null;
  /** Adapter-specific connection configuration (non-secret). */
  config: Record<string, unknown>;
  pageLimit: number;
}

export interface ConnectionValidation {
  ok: boolean;
  /** Sanitized, operator-safe outcome message. */
  message: string;
  capabilities?: ProviderCapabilities;
  failureCode?: string;
}

export interface WebhookVerification {
  valid: boolean;
  reason?: string;
}

export interface ParsedWebhookEvent {
  providerEventId: string;
  eventType: string;
  /** Sanitized payload summary persisted as evidence. */
  payload: Record<string, unknown>;
}

export interface ProviderAdapter {
  key: ProviderKey;
  displayName: string;
  adapterVersion: string;
  /** 'available' adapters may execute; 'blocked' adapters fail closed. */
  status: "available" | "blocked";
  blockedReasons: string[];
  /** Steps an operator must complete before the provider can activate. */
  setupChecklist: string[];

  getCapabilities(): ProviderCapabilities;
  validateConnection(ctx: FetchContext): Promise<ConnectionValidation>;
  healthCheck(ctx: FetchContext): Promise<ConnectionValidation>;

  /** Fetch one bounded page of appointments. Optional per capabilities. */
  fetchAppointments?(ctx: FetchContext): Promise<ProviderPage>;
  /** Incremental variant (modified-since); optional per capabilities. */
  fetchChangedAppointments?(ctx: FetchContext, since: string): Promise<ProviderPage>;

  /**
   * Convert one raw provider record into the EXISTING import staging
   * shape. This is where provider structures end; everything downstream
   * is the Phase 3 pipeline.
   */
  normalizeSourceRecord(
    record: ProviderRecord,
    ctx: { organizationTimezone: string },
  ): NormalizeResult;

  /** Column order for the deterministic evidence CSV built from records. */
  evidenceColumns: string[];
  /** Serialize one record into the evidence CSV row (matching columns). */
  toEvidenceRow(record: ProviderRecord): Record<string, string>;
  /** The import SourceAdapter used to stage the evidence CSV. */
  importAdapter: SourceAdapter;

  verifyWebhook?(args: {
    rawBody: string;
    signatureHeader: string | null;
    secret: string | null;
    timestampHeader?: string | null;
  }): WebhookVerification;
  parseWebhook?(rawBody: string, contentType: string): ParsedWebhookEvent | null;
}

export class ProviderBlockedError extends Error {
  readonly failureCode = "provider_blocked";
  constructor(providerKey: string, reasons: string[]) {
    super(
      `Provider '${providerKey}' is blocked and cannot execute: ${reasons.join("; ")}`,
    );
    this.name = "ProviderBlockedError";
  }
}
