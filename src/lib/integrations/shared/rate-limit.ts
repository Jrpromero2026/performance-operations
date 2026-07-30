/**
 * Rate-limit handling — provider limits are treated as OBSERVED signals
 * (Retry-After / X-RateLimit-* headers), never as hardcoded facts: none
 * of our providers documents concrete numbers (see *_API_FINDINGS.md).
 */

import type { RateLimitObservation } from "./contract";

export interface RateLimitState {
  requestsMade: number;
  remaining: number | null;
  resetAt: string | null;
  retryAfterSeconds: number | null;
  throttled: boolean;
  consecutiveThrottles: number;
}

export function initialRateLimitState(): RateLimitState {
  return {
    requestsMade: 0,
    remaining: null,
    resetAt: null,
    retryAfterSeconds: null,
    throttled: false,
    consecutiveThrottles: 0,
  };
}

/** Fold one response's observation into the connection-scoped state. */
export function applyObservation(
  state: RateLimitState,
  observation: RateLimitObservation | undefined,
): RateLimitState {
  const next: RateLimitState = {
    ...state,
    requestsMade: state.requestsMade + 1,
  };
  if (!observation) {
    next.throttled = false;
    next.consecutiveThrottles = 0;
    next.retryAfterSeconds = null;
    return next;
  }
  next.remaining = observation.remaining;
  next.resetAt = observation.resetAt;
  next.retryAfterSeconds = observation.retryAfterSeconds;
  next.throttled = observation.throttled;
  next.consecutiveThrottles = observation.throttled
    ? state.consecutiveThrottles + 1
    : 0;
  return next;
}

/**
 * Seconds to pause before the next request for THIS connection. Honors
 * Retry-After exactly; otherwise a conservative default when throttled.
 * Never busy-loops (minimum 1s when throttled), never pauses when clear.
 */
export function pauseSeconds(state: RateLimitState): number {
  if (!state.throttled) return 0;
  if (state.retryAfterSeconds !== null && state.retryAfterSeconds >= 0) {
    return Math.min(3600, Math.max(1, state.retryAfterSeconds));
  }
  if (state.resetAt) {
    const deltaMs = new Date(state.resetAt).getTime() - Date.now();
    if (Number.isFinite(deltaMs)) return Math.min(3600, Math.max(1, Math.ceil(deltaMs / 1000)));
  }
  return Math.min(300, 30 * Math.max(1, state.consecutiveThrottles));
}

/** Parse standard headers into an observation (null-safe). */
export function observeHeaders(headers: {
  get(name: string): string | null;
}): RateLimitObservation {
  const retryAfter = headers.get("retry-after");
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");
  const retryAfterSeconds =
    retryAfter !== null && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null;
  return {
    remaining: remaining !== null && /^\d+$/.test(remaining) ? Number(remaining) : null,
    resetAt:
      reset !== null && /^\d+$/.test(reset)
        ? new Date(Number(reset) * 1000).toISOString()
        : null,
    retryAfterSeconds,
    throttled: retryAfterSeconds !== null,
  };
}
