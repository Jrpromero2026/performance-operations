/**
 * Pure commission-tier validation (unit-tested; the DB enforces the same
 * invariants with check + exclusion constraints).
 */

export interface TierInput {
  sequence: number;
  minRevenueCents: number;
  maxRevenueCents: number | null;
  rateBasisPoints: number;
}

/** Validate one tier; returns an error string or null. */
export function validateTier(tier: TierInput): string | null {
  if (!Number.isSafeInteger(tier.minRevenueCents) || tier.minRevenueCents < 0) {
    return "Minimum revenue must be a non-negative integer number of cents.";
  }
  if (
    tier.maxRevenueCents !== null &&
    (!Number.isSafeInteger(tier.maxRevenueCents) ||
      tier.maxRevenueCents <= tier.minRevenueCents)
  ) {
    return "Maximum revenue must be an integer number of cents greater than the minimum.";
  }
  if (
    !Number.isSafeInteger(tier.rateBasisPoints) ||
    tier.rateBasisPoints < 0 ||
    tier.rateBasisPoints > 10_000
  ) {
    return "Rate must be an integer between 0 and 10000 basis points.";
  }
  if (!Number.isSafeInteger(tier.sequence) || tier.sequence < 1) {
    return "Sequence must be a positive integer.";
  }
  return null;
}

/**
 * Validate a tier set: individual validity, unique sequences, ordering
 * (higher sequence covers higher revenue), and no range overlaps.
 */
export function validateTierSet(tiers: readonly TierInput[]): string | null {
  for (const tier of tiers) {
    const error = validateTier(tier);
    if (error) return `Tier ${tier.sequence}: ${error}`;
  }

  const sequences = new Set(tiers.map((t) => t.sequence));
  if (sequences.size !== tiers.length) {
    return "Tier sequence numbers must be unique.";
  }

  const sorted = [...tiers].sort((a, b) => a.sequence - b.sequence);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const current = sorted[i];
    if (current.minRevenueCents < prev.minRevenueCents) {
      return "Tiers must cover increasing revenue ranges in sequence order.";
    }
  }

  // Overlap: ranges are [min, max) with null max = unbounded.
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const aMax = a.maxRevenueCents ?? Number.MAX_SAFE_INTEGER;
      const bMax = b.maxRevenueCents ?? Number.MAX_SAFE_INTEGER;
      if (a.minRevenueCents < bMax && b.minRevenueCents < aMax) {
        return `Tiers ${a.sequence} and ${b.sequence} overlap in revenue range.`;
      }
    }
  }
  return null;
}
