/**
 * Shared metric math. The ONLY place ratio/median/growth arithmetic lives —
 * every module uses these so a formula can never fork.
 *
 * Ratios are returned in integer basis points (10000 = 100%), money stays
 * integer cents; intermediate division rounds half-away-from-zero exactly
 * like the payroll engine (integer rationals, no float drift on money).
 */

export class MetricMathError extends Error {}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new MetricMathError(`${label} must be a safe integer, got ${value}`);
  }
}

/** Round an integer rational half-away-from-zero (shared rounding rule). */
export function roundRatio(numerator: number, denominator: number): number {
  assertSafeInteger(numerator, "numerator");
  assertSafeInteger(denominator, "denominator");
  if (denominator <= 0) throw new MetricMathError("denominator must be > 0");
  const quotient = Math.trunc(numerator / denominator);
  const remainder = Math.abs(numerator % denominator);
  if (remainder * 2 >= denominator) {
    return numerator < 0 ? quotient - 1 : quotient + 1;
  }
  return quotient;
}

/**
 * numerator/denominator as basis points (10000 = 100%).
 * Returns null when the denominator is zero (undefined, never fake 0).
 */
export function ratioBp(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return roundRatio(numerator * 10_000, denominator);
}

/** Integer per-unit rate (e.g. cents per session). Null when denominator 0. */
export function perUnit(totalCents: number, units: number): number | null {
  if (units === 0) return null;
  return roundRatio(totalCents, units);
}

/** Cents per hour from cents and minutes. Null when minutes 0. */
export function perHour(totalCents: number, minutes: number): number | null {
  if (minutes === 0) return null;
  return roundRatio(totalCents * 60, minutes);
}

/** Arithmetic mean rounded half-away-from-zero. Null on empty input. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return roundRatio(sum, values.length);
}

/**
 * Median (lower-interpolated to an integer: even counts round the midpoint
 * half-away-from-zero). Null on empty input.
 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return roundRatio(sorted[mid - 1] + sorted[mid], 2);
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Growth of current vs previous as signed basis points of previous
 * (previous 100 → current 150 = +5000bp). Null when previous is 0 or null —
 * growth from nothing is undefined, never ∞ or fake 0.
 */
export function growthBp(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return roundRatio((current - previous) * 10_000, Math.abs(previous));
}

/** Minutes → whole hours ONLY for display-safe integer hour counts. */
export function minutesToHoursTimes100(minutes: number): number {
  // hours with 2 decimals encoded as integer (90 min → 150).
  return roundRatio(minutes * 100, 60);
}
