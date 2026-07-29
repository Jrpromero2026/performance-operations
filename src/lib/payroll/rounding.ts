/**
 * Payroll rounding. All rounding happens on exact integer rationals
 * (numerator/denominator) — floats never touch money. The stored default is
 * half_away_from_zero; plan versions may narrow the scope (per_line vs
 * per_trainer) but the method is fixed per calculation for determinism.
 */

export const ROUNDING_METHODS = [
  "half_away_from_zero",
  "half_up",
  "half_even",
  "floor",
  "ceiling",
  "truncate",
] as const;

export type RoundingMethod = (typeof ROUNDING_METHODS)[number];

export const DEFAULT_ROUNDING_METHOD: RoundingMethod = "half_away_from_zero";

export const ROUNDING_SCOPES = ["per_line", "per_trainer"] as const;
export type RoundingScope = (typeof ROUNDING_SCOPES)[number];

export class RoundingError extends Error {}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RoundingError(`${label} must be a safe integer, got ${value}`);
  }
}

/**
 * Round numerator/denominator to the nearest integer using the given method.
 * Denominator must be a positive integer; numerator may be negative.
 */
export function roundRational(
  numerator: number,
  denominator: number,
  method: RoundingMethod,
): number {
  assertSafeInteger(numerator, "numerator");
  assertSafeInteger(denominator, "denominator");
  if (denominator <= 0) {
    throw new RoundingError("denominator must be a positive integer");
  }

  const quotient = Math.trunc(numerator / denominator);
  const remainder = numerator % denominator; // sign follows numerator
  if (remainder === 0) return quotient;

  const negative = numerator < 0;
  const absRemainder = Math.abs(remainder);
  const twice = absRemainder * 2;

  switch (method) {
    case "truncate":
      return quotient;
    case "floor":
      return negative ? quotient - 1 : quotient;
    case "ceiling":
      return negative ? quotient : quotient + 1;
    case "half_away_from_zero":
      if (twice >= denominator) return negative ? quotient - 1 : quotient + 1;
      return quotient;
    case "half_up":
      // Ties round toward +infinity.
      if (twice > denominator) return negative ? quotient - 1 : quotient + 1;
      if (twice === denominator) return quotient + (negative ? 0 : 1);
      return quotient;
    case "half_even": {
      if (twice > denominator) return negative ? quotient - 1 : quotient + 1;
      if (twice < denominator) return quotient;
      const down = quotient;
      const up = negative ? quotient - 1 : quotient + 1;
      return down % 2 === 0 ? down : up;
    }
  }
}

/** Apply basis points (1% = 100 bp) to cents with an explicit method. */
export function applyRateRounded(
  amountCents: number,
  rateBasisPoints: number,
  method: RoundingMethod,
): number {
  assertSafeInteger(amountCents, "amountCents");
  assertSafeInteger(rateBasisPoints, "rateBasisPoints");
  if (rateBasisPoints < 0) {
    throw new RoundingError("rateBasisPoints must be >= 0");
  }
  return roundRational(amountCents * rateBasisPoints, 10_000, method);
}

/** Minutes × hourly cents rate → cents (rate is per 60 minutes). */
export function minutesTimesHourlyRate(
  minutes: number,
  hourlyRateCents: number,
  method: RoundingMethod,
): number {
  assertSafeInteger(minutes, "minutes");
  assertSafeInteger(hourlyRateCents, "hourlyRateCents");
  if (minutes < 0) throw new RoundingError("minutes must be >= 0");
  return roundRational(minutes * hourlyRateCents, 60, method);
}

export function isRoundingMethod(value: string): value is RoundingMethod {
  return (ROUNDING_METHODS as readonly string[]).includes(value);
}

export function isRoundingScope(value: string): value is RoundingScope {
  return (ROUNDING_SCOPES as readonly string[]).includes(value);
}
