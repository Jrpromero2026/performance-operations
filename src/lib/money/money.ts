/**
 * Money utilities. All amounts are integer cents; all rates are integer
 * basis points (1% = 100 bp). No floating-point arithmetic touches money —
 * every function validates integer inputs and rounds explicitly.
 */

export type Cents = number;
export type BasisPoints = number;

export class MoneyError extends Error {}

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a safe integer, got ${value}`);
  }
}

/** Add amounts in cents. */
export function addCents(...amounts: Cents[]): Cents {
  let total = 0;
  for (const amount of amounts) {
    assertInteger(amount, "amount");
    total += amount;
    assertInteger(total, "total");
  }
  return total;
}

/** Subtract b from a. */
export function subtractCents(a: Cents, b: Cents): Cents {
  assertInteger(a, "a");
  assertInteger(b, "b");
  return a - b;
}

/**
 * Multiply an amount by a quantity (e.g., sessions × rate).
 * Quantity must be a non-negative integer.
 */
export function multiplyCents(amount: Cents, quantity: number): Cents {
  assertInteger(amount, "amount");
  assertInteger(quantity, "quantity");
  if (quantity < 0) throw new MoneyError("quantity must be >= 0");
  const result = amount * quantity;
  assertInteger(result, "result");
  return result;
}

/**
 * Apply a basis-point rate to an amount (e.g., 35% commission = 3500 bp),
 * rounding half-up on the true remainder (no floats).
 */
export function applyBasisPoints(amount: Cents, rate: BasisPoints): Cents {
  assertInteger(amount, "amount");
  assertInteger(rate, "rate");
  if (rate < 0) throw new MoneyError("rate must be >= 0");
  const product = amount * rate;
  assertInteger(product, "product");
  const quotient = Math.trunc(product / 10_000);
  const remainder = Math.abs(product % 10_000);
  const roundUp = remainder * 2 >= 10_000;
  if (!roundUp) return quotient;
  return product >= 0 ? quotient + 1 : quotient - 1;
}

/**
 * Split an amount into `parts` shares that sum exactly to the original,
 * distributing the remainder one cent at a time from the first share.
 */
export function splitCents(amount: Cents, parts: number): Cents[] {
  assertInteger(amount, "amount");
  assertInteger(parts, "parts");
  if (parts <= 0) throw new MoneyError("parts must be >= 1");
  const base = Math.trunc(amount / parts);
  let remainder = amount - base * parts;
  const step = remainder >= 0 ? 1 : -1;
  const shares: Cents[] = [];
  for (let i = 0; i < parts; i++) {
    let share = base;
    if (remainder !== 0) {
      share += step;
      remainder -= step;
    }
    shares.push(share);
  }
  return shares;
}

/** Format cents as USD currency text (display only). */
export function formatCents(amount: Cents, currency = "USD"): string {
  assertInteger(amount, "amount");
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  });
  // Intl only rounds at display; arithmetic already happened in integers.
  return formatter.format(amount / 100);
}

/**
 * Parse a currency string ("$1,234.56", "1234.5", "-12") into cents.
 * Rejects anything with more than two decimal places or non-numeric noise.
 */
export function parseCents(input: string): Cents {
  const cleaned = input.replace(/[$,\s]/g, "");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) throw new MoneyError(`Cannot parse money value: ${input}`);
  const [, sign, whole, fraction = ""] = match;
  const centsPart = (fraction + "00").slice(0, 2);
  const cents = parseInt(whole, 10) * 100 + parseInt(centsPart, 10);
  assertInteger(cents, "parsed cents");
  return sign === "-" ? -cents : cents;
}
