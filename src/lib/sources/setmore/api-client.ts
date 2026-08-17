/**
 * Setmore REST transport. SERVER ONLY.
 *
 * The refresh token, the derived access token, and every Authorization
 * header exist exclusively inside this module's call stack. Nothing here
 * is importable from a client component: no value is exported that
 * contains a credential, nothing is ever written to disk, and error
 * messages pass through `sanitizeErrorMessage` before they can reach an
 * operator surface.
 *
 * Access tokens ARE held in process memory for their (≈7 day) lifetime —
 * see `getAccessToken`. Setmore's own quickstart directs integrations to
 * hold a token and refresh it before it lapses, and minting one per
 * request would multiply calls against an account whose rate limits the
 * vendor explicitly declines to publish.
 *
 * Contract verified from official documentation 2026-07-29
 * (docs/SETMORE_API_FINDINGS.md). No behaviour here is inferred from an
 * undocumented field. Because Setmore has **no sandbox** ("all API
 * requests use live accounts"), this transport is read-only: it never
 * calls a create/update endpoint.
 */

import { createHash } from "node:crypto";
import { IntegrationFailure } from "@/lib/integrations/shared/failures";
import type { RateLimitObservation } from "@/lib/integrations/shared/contract";

export const SETMORE_API_BASE = "https://developer.setmore.com/api/v1";

/** Documented ceilings — requesting more is a client error, not a limit to discover. */
export const SETMORE_MAX_APPOINTMENT_PAGE = 150;
export const SETMORE_MAX_STAFF_PAGE = 50;

export interface SetmoreAccessToken {
  accessToken: string;
  /** Epoch ms at which the token stops being usable. */
  expiresAtMs: number;
}

interface SetmoreRequestOptions {
  /** Bounded by the caller; the sync engine supplies its own budget. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/* --------------------------------------------------------------- helpers */

/**
 * Setmore documents no rate-limit headers, so limits are read as
 * OBSERVED signals only. Absent headers mean "unknown", never "unlimited".
 */
function readRateLimit(response: Response): RateLimitObservation | undefined {
  const retryAfterRaw = response.headers.get("retry-after");
  const remainingRaw =
    response.headers.get("x-ratelimit-remaining") ?? response.headers.get("ratelimit-remaining");
  const resetRaw =
    response.headers.get("x-ratelimit-reset") ?? response.headers.get("ratelimit-reset");
  const throttled = response.status === 429;
  if (!retryAfterRaw && !remainingRaw && !resetRaw && !throttled) return undefined;

  const retryAfterSeconds = retryAfterRaw !== null ? Number(retryAfterRaw) : null;
  const remaining = remainingRaw !== null ? Number(remainingRaw) : null;
  return {
    remaining: remaining !== null && Number.isFinite(remaining) ? remaining : null,
    resetAt: resetRaw !== null ? isoFromResetHeader(resetRaw) : null,
    retryAfterSeconds:
      retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds
        : null,
    throttled,
  };
}

function isoFromResetHeader(value: string): string | null {
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    // Heuristically seconds-epoch vs ms-epoch; both are treated as instants.
    const ms = asNumber > 1e12 ? asNumber : asNumber * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/** Map an HTTP status onto the platform's stable failure vocabulary. */
function failureForStatus(status: number, body: string): IntegrationFailure {
  const detail = body.slice(0, 200);
  if (status === 401) {
    return new IntegrationFailure(
      "authentication_failed",
      "Setmore rejected the credential (401)."
    );
  }
  if (status === 403) {
    return new IntegrationFailure(
      "authorization_failed",
      "Setmore denied access to this resource (403)."
    );
  }
  if (status === 429) {
    return new IntegrationFailure("rate_limited", "Setmore rate limit reached (429).");
  }
  if (status >= 500) {
    return new IntegrationFailure(
      "provider_unavailable",
      `Setmore returned ${status}; the service is unavailable.`
    );
  }
  return new IntegrationFailure(
    "invalid_response",
    `Setmore returned an unexpected ${status} response: ${detail}`
  );
}

async function requestJson(
  url: string,
  init: RequestInit,
  options: SetmoreRequestOptions
): Promise<{ body: Record<string, unknown>; rateLimit: RateLimitObservation | undefined }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new IntegrationFailure("network_timeout", "Setmore request timed out.");
    }
    throw new IntegrationFailure(
      "network_timeout",
      "Setmore request failed before a response was received."
    );
  } finally {
    clearTimeout(timer);
  }

  const rateLimit = readRateLimit(response);
  const text = await response.text();
  if (!response.ok) throw failureForStatus(response.status, text);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new IntegrationFailure(
      "invalid_response",
      "Setmore returned a non-JSON response body."
    );
  }
  if (typeof body !== "object" || body === null) {
    throw new IntegrationFailure("invalid_response", "Setmore returned a non-object body.");
  }
  return { body: body as Record<string, unknown>, rateLimit };
}

/* ------------------------------------------------------------------ auth */

/**
 * Exchange the beta refresh token for a bearer access token.
 * `GET /o/oauth2/token?refreshToken=…` → `{ data: { token: { access_token,
 * expires_in } } }`. The refresh token is placed in the query string
 * because that is the documented contract; it never appears in a log,
 * an error message, or a persisted record.
 */
export async function exchangeRefreshToken(
  refreshToken: string,
  options: SetmoreRequestOptions = {}
): Promise<SetmoreAccessToken> {
  if (!refreshToken || refreshToken.trim() === "") {
    throw new IntegrationFailure(
      "authentication_failed",
      "No Setmore refresh token is stored for this connection."
    );
  }
  const url = `${SETMORE_API_BASE}/o/oauth2/token?refreshToken=${encodeURIComponent(refreshToken.trim())}`;
  const { body } = await requestJson(url, { method: "GET" }, options);

  const token = readTokenPayload(body);
  if (!token) {
    throw new IntegrationFailure(
      "invalid_response",
      "Setmore token response did not contain an access token in the documented shape."
    );
  }
  return token;
}

function readTokenPayload(body: Record<string, unknown>): SetmoreAccessToken | null {
  const data = body.data;
  const container =
    typeof data === "object" && data !== null
      ? ((data as Record<string, unknown>).token ?? data)
      : body;
  if (typeof container !== "object" || container === null) return null;
  const record = container as Record<string, unknown>;
  const accessToken = record.access_token;
  if (typeof accessToken !== "string" || accessToken.trim() === "") return null;
  const expiresIn = Number(record.expires_in);
  // Documented ≈ 604799s (7 days). A missing/absurd value falls back to a
  // conservative hour rather than being trusted.
  const lifetimeSeconds =
    Number.isFinite(expiresIn) && expiresIn > 0 && expiresIn <= 2_592_000 ? expiresIn : 3_600;
  return {
    accessToken,
    // Refresh a minute early so a token never expires mid-page.
    expiresAtMs: Date.now() + (lifetimeSeconds - 60) * 1000,
  };
}

export function isTokenUsable(token: SetmoreAccessToken | null): boolean {
  return token !== null && token.expiresAtMs > Date.now();
}

/* ----------------------------------------------------------- token cache */

/**
 * Process-local access-token cache.
 *
 * Keyed by a HASH of the refresh token, never the token itself, so the
 * credential does not sit in a map key where a heap dump or an accidental
 * serialization of the cache would expose it. Values hold only the derived
 * access token and its expiry.
 *
 * Bounded, because one process may serve many connections and an unbounded
 * map keyed by credential is a slow leak.
 */
const MAX_CACHED_TOKENS = 32;
const tokenCache = new Map<string, SetmoreAccessToken>();

function cacheKey(refreshToken: string): string {
  return createHash("sha256").update(refreshToken.trim()).digest("hex");
}

/**
 * Return a usable access token, exchanging the refresh token only when
 * there is no live one cached.
 *
 * This is what callers should use. `exchangeRefreshToken` remains exported
 * for the paths that deliberately want a fresh round-trip — credential
 * validation, which is asking "does this credential still work right now?"
 * and must not be answered from cache.
 */
export async function getAccessToken(
  refreshToken: string,
  options: SetmoreRequestOptions = {}
): Promise<SetmoreAccessToken> {
  const key = cacheKey(refreshToken);
  const cached = tokenCache.get(key);
  if (isTokenUsable(cached ?? null)) return cached!;

  const token = await exchangeRefreshToken(refreshToken, options);
  if (tokenCache.size >= MAX_CACHED_TOKENS) {
    // Evict the oldest insertion; Map preserves insertion order.
    const oldest = tokenCache.keys().next();
    if (!oldest.done) tokenCache.delete(oldest.value);
  }
  tokenCache.set(key, token);
  return token;
}

/** Drop every cached token. Used on credential rotation and by tests. */
export function clearAccessTokenCache(): void {
  tokenCache.clear();
}

/* -------------------------------------------------------------- fetching */

export interface SetmoreListPage<T> {
  items: T[];
  nextCursor: string | null;
  rateLimit: RateLimitObservation | undefined;
}

function authHeaders(token: SetmoreAccessToken): HeadersInit {
  return { Authorization: `Bearer ${token.accessToken}`, Accept: "application/json" };
}

/**
 * Read a list payload. Setmore nests results under `data.<collection>`
 * with an optional `cursor`. An unexpected shape is `invalid_response`,
 * never an empty result — silently returning [] would look like "no
 * appointments" and could understate a period.
 */
function readListPayload<T>(
  body: Record<string, unknown>,
  collection: string
): { items: T[]; nextCursor: string | null } {
  const data = body.data;
  const container = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : body;
  const raw = container[collection];
  if (!Array.isArray(raw)) {
    throw new IntegrationFailure(
      "invalid_response",
      `Setmore response did not contain a '${collection}' array in the documented shape.`
    );
  }
  const cursorRaw = container.cursor ?? body.cursor;
  const nextCursor =
    typeof cursorRaw === "string" && cursorRaw.trim() !== "" ? cursorRaw.trim() : null;
  return { items: raw as T[], nextCursor };
}

/** Setmore appointment windows use `dd-MM-yyyy`, unlike everything else. */
export function toSetmoreDateParam(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) {
    throw new IntegrationFailure(
      "validation_failure",
      "Setmore date window must be an ISO date (yyyy-MM-dd)."
    );
  }
  const [, y, m, d] = match;
  return `${d}-${m}-${y}`;
}

export async function fetchAppointmentsPage(
  token: SetmoreAccessToken,
  args: {
    startDate: string;
    endDate: string;
    cursor?: string | null;
    limit?: number;
    staffKey?: string | null;
    customerDetails?: boolean;
  },
  options: SetmoreRequestOptions = {}
): Promise<SetmoreListPage<Record<string, unknown>>> {
  const params = new URLSearchParams({
    startDate: toSetmoreDateParam(args.startDate),
    endDate: toSetmoreDateParam(args.endDate),
  });
  const limit = Math.min(args.limit ?? SETMORE_MAX_APPOINTMENT_PAGE, SETMORE_MAX_APPOINTMENT_PAGE);
  params.set("limit", String(limit));
  if (args.cursor) params.set("cursor", args.cursor);
  if (args.staffKey) params.set("staff_key", args.staffKey);
  // Customer details are requested only when the caller needs identity
  // fields; PII is not fetched by default.
  if (args.customerDetails) params.set("customerDetails", "true");

  const { body, rateLimit } = await requestJson(
    `${SETMORE_API_BASE}/bookingapi/appointments?${params.toString()}`,
    { method: "GET", headers: authHeaders(token) },
    options
  );
  const { items, nextCursor } = readListPayload<Record<string, unknown>>(body, "appointments");
  return { items, nextCursor, rateLimit };
}

export async function fetchStaffPage(
  token: SetmoreAccessToken,
  args: { cursor?: string | null } = {},
  options: SetmoreRequestOptions = {}
): Promise<SetmoreListPage<Record<string, unknown>>> {
  const params = new URLSearchParams();
  if (args.cursor) params.set("cursor", args.cursor);
  const query = params.toString();
  const { body, rateLimit } = await requestJson(
    `${SETMORE_API_BASE}/bookingapi/staffs${query ? `?${query}` : ""}`,
    { method: "GET", headers: authHeaders(token) },
    options
  );
  const { items, nextCursor } = readListPayload<Record<string, unknown>>(body, "staffs");
  return { items, nextCursor, rateLimit };
}

export async function fetchServices(
  token: SetmoreAccessToken,
  options: SetmoreRequestOptions = {}
): Promise<SetmoreListPage<Record<string, unknown>>> {
  const { body, rateLimit } = await requestJson(
    `${SETMORE_API_BASE}/bookingapi/services`,
    { method: "GET", headers: authHeaders(token) },
    options
  );
  const { items, nextCursor } = readListPayload<Record<string, unknown>>(body, "services");
  return { items, nextCursor, rateLimit };
}

export async function fetchServiceCategories(
  token: SetmoreAccessToken,
  options: SetmoreRequestOptions = {}
): Promise<SetmoreListPage<Record<string, unknown>>> {
  const { body, rateLimit } = await requestJson(
    `${SETMORE_API_BASE}/bookingapi/services/categories`,
    { method: "GET", headers: authHeaders(token) },
    options
  );
  const { items, nextCursor } = readListPayload<Record<string, unknown>>(body, "categories");
  return { items, nextCursor, rateLimit };
}

/**
 * Customer lookup. NOTE the documented capability gap: Setmore exposes
 * only a name/email/phone SEARCH — there is no "list all customers"
 * endpoint, so the client mirror is built from appointment participation
 * (with `customerDetails=true`), not from a customer enumeration.
 */
export async function searchCustomers(
  token: SetmoreAccessToken,
  args: { firstname?: string; email?: string; phone?: string },
  options: SetmoreRequestOptions = {}
): Promise<SetmoreListPage<Record<string, unknown>>> {
  const params = new URLSearchParams();
  if (args.firstname) params.set("firstname", args.firstname);
  if (args.email) params.set("email", args.email);
  if (args.phone) params.set("phone", args.phone);
  if ([...params.keys()].length === 0) {
    throw new IntegrationFailure(
      "validation_failure",
      "Setmore customer lookup requires at least one of firstname, email, or phone."
    );
  }
  const { body, rateLimit } = await requestJson(
    `${SETMORE_API_BASE}/bookingapi/customer?${params.toString()}`,
    { method: "GET", headers: authHeaders(token) },
    options
  );
  const { items, nextCursor } = readListPayload<Record<string, unknown>>(body, "customers");
  return { items, nextCursor, rateLimit };
}
