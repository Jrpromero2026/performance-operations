import { normalizePhone, normalizeText } from "./values";
import type { NormalizedRow } from "./types";

/**
 * Entity matching — pure functions over pre-loaded, ORGANIZATION-SCOPED
 * lookup tables (the pipeline builds lookups from a single organization,
 * which structurally prevents cross-organization matches). Weak name-only
 * similarity never auto-matches; it produces review candidates.
 */

export interface TrainerLookup {
  id: string;
  displayName: string;
  email: string | null;
  /** External scheduling-system id for the batch source, if configured. */
  sourceId: string | null;
  /** Approved aliases (normalized) for the batch source. */
  aliases: string[];
}

export interface ServiceLookup {
  id: string;
  internalName: string;
  displayName: string;
  /** Normalized aliases for the batch source. */
  aliases: string[];
  departmentId: string | null;
}

export interface ClientLookup {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  /** External id for the batch source, if known. */
  sourceId: string | null;
}

export type MatchMethod =
  | "source_id"
  | "alias"
  | "email"
  | "phone"
  | "exact_name"
  | "name_corroborated"
  | "unmatched";

export interface MatchOutcome<T> {
  matched: T | null;
  method: MatchMethod;
  /** Review candidates when unmatched/ambiguous (best first, max 5). */
  candidates: T[];
  requiresReview: boolean;
}

export function matchTrainer(
  row: NormalizedRow,
  trainers: TrainerLookup[]
): MatchOutcome<TrainerLookup> {
  const name = row.sourceTrainerName ? normalizeText(row.sourceTrainerName) : null;
  const email = row.sourceTrainerEmail ? normalizeText(row.sourceTrainerEmail) : null;

  // 1) exact configured source identifier (none provided by Setmore v1, but
  //    supported for sources that carry trainer ids)
  // 2) approved alias  3) exact email  4) exact unique full name
  if (name) {
    const byAlias = trainers.filter((t) => t.aliases.includes(name));
    if (byAlias.length === 1) {
      return { matched: byAlias[0], method: "alias", candidates: [], requiresReview: false };
    }
  }
  if (email) {
    const byEmail = trainers.filter((t) => t.email && normalizeText(t.email) === email);
    if (byEmail.length === 1) {
      return { matched: byEmail[0], method: "email", candidates: [], requiresReview: false };
    }
  }
  if (name) {
    const byName = trainers.filter((t) => normalizeText(t.displayName) === name);
    if (byName.length === 1) {
      return { matched: byName[0], method: "exact_name", candidates: [], requiresReview: false };
    }
    if (byName.length > 1) {
      return {
        matched: null,
        method: "unmatched",
        candidates: byName.slice(0, 5),
        requiresReview: true,
      };
    }
    // weak candidates: shared last token — NEVER auto-matched
    const lastToken = name.split(" ").at(-1) ?? "";
    const weak = lastToken.length >= 3
      ? trainers.filter((t) => normalizeText(t.displayName).split(" ").at(-1) === lastToken)
      : [];
    return {
      matched: null,
      method: "unmatched",
      candidates: weak.slice(0, 5),
      requiresReview: true,
    };
  }
  return { matched: null, method: "unmatched", candidates: [], requiresReview: true };
}

/** Trainer matching by explicit source id (checked before matchTrainer). */
export function matchTrainerBySourceId(
  externalTrainerId: string | undefined,
  trainers: TrainerLookup[]
): TrainerLookup | null {
  if (!externalTrainerId) return null;
  const hit = trainers.filter((t) => t.sourceId === externalTrainerId);
  return hit.length === 1 ? hit[0] : null;
}

export function matchService(
  row: NormalizedRow,
  services: ServiceLookup[]
): MatchOutcome<ServiceLookup> {
  const name = row.sourceServiceName ? normalizeText(row.sourceServiceName) : null;
  if (!name) {
    return { matched: null, method: "unmatched", candidates: [], requiresReview: true };
  }
  const byAlias = services.filter((s) => s.aliases.includes(name));
  if (byAlias.length === 1) {
    return { matched: byAlias[0], method: "alias", candidates: [], requiresReview: false };
  }
  const byInternal = services.filter((s) => normalizeText(s.internalName) === name);
  if (byInternal.length === 1) {
    return { matched: byInternal[0], method: "exact_name", candidates: [], requiresReview: false };
  }
  const byDisplay = services.filter((s) => normalizeText(s.displayName) === name);
  if (byDisplay.length === 1) {
    return { matched: byDisplay[0], method: "exact_name", candidates: [], requiresReview: false };
  }
  // suggestion candidates: token overlap, review required
  const tokens = new Set(name.split(" ").filter((t) => t.length > 3));
  const scored = services
    .map((s) => ({
      s,
      score: normalizeText(`${s.displayName} ${s.internalName}`)
        .split(" ")
        .filter((t) => tokens.has(t)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
  return { matched: null, method: "unmatched", candidates: scored.slice(0, 5), requiresReview: true };
}

export function matchClient(
  row: NormalizedRow,
  clients: ClientLookup[]
): MatchOutcome<ClientLookup> {
  const externalId = row.externalClientId;
  if (externalId) {
    const byId = clients.filter((c) => c.sourceId === externalId);
    if (byId.length === 1) {
      return { matched: byId[0], method: "source_id", candidates: [], requiresReview: false };
    }
  }
  const email = row.sourceClientEmail ? normalizeText(row.sourceClientEmail) : null;
  if (email) {
    const byEmail = clients.filter((c) => c.email && normalizeText(c.email) === email);
    if (byEmail.length === 1) {
      return { matched: byEmail[0], method: "email", candidates: [], requiresReview: false };
    }
  }
  const phone = row.sourceClientPhone ? normalizePhone(row.sourceClientPhone) : null;
  if (phone && phone.length >= 7) {
    const byPhone = clients.filter((c) => c.phone && normalizePhone(c.phone) === phone);
    if (byPhone.length === 1) {
      return { matched: byPhone[0], method: "phone", candidates: [], requiresReview: false };
    }
  }
  const name = row.sourceClientName ? normalizeText(row.sourceClientName) : null;
  if (name) {
    const byName = clients.filter((c) => normalizeText(c.displayName) === name);
    if (byName.length === 1) {
      const candidate = byName[0];
      // name + corroborating detail auto-matches; name alone requires review
      const corroborated =
        (email && candidate.email && normalizeText(candidate.email) === email) ||
        (phone && candidate.phone && normalizePhone(candidate.phone) === phone);
      if (corroborated) {
        return {
          matched: candidate,
          method: "name_corroborated",
          candidates: [],
          requiresReview: false,
        };
      }
      return { matched: null, method: "unmatched", candidates: [candidate], requiresReview: true };
    }
    if (byName.length > 1) {
      return {
        matched: null,
        method: "unmatched",
        candidates: byName.slice(0, 5),
        requiresReview: true,
      };
    }
  }
  return { matched: null, method: "unmatched", candidates: [], requiresReview: true };
}

/* ------------------------------------------------------------------------- */
/* Duplicate classification                                                   */
/* ------------------------------------------------------------------------- */

export type DuplicateClass =
  | "new"
  | "exact_duplicate"
  | "possible_duplicate"
  | "source_update"
  | "conflict"
  | "previously_reversed";

/** A posted appointment occurrence, keyed for duplicate detection. */
export interface ExistingOccurrence {
  externalAppointmentId: string | null;
  startAt: string;
  trainerId: string | null;
  serviceId: string | null;
  canonicalStatus: string;
  durationMinutes: number;
  recordState: "active" | "reversed" | "voided" | "superseded";
}

export interface StagedOccurrence {
  externalAppointmentId?: string;
  startAt?: string;
  matchedTrainerId?: string | null;
  matchedServiceId?: string | null;
  canonicalStatus?: string | null;
  durationMinutes?: number;
}

/**
 * Classify one staged row against posted occurrences (same org+source) and
 * earlier rows of the SAME batch. Deterministic key: external id + start.
 * Fallback fingerprint: trainer + start + duration (+service).
 */
export function classifyDuplicate(
  staged: StagedOccurrence,
  existing: ExistingOccurrence[],
  seenInBatch: Set<string>
): DuplicateClass {
  const key =
    staged.externalAppointmentId && staged.startAt
      ? `${staged.externalAppointmentId}|${staged.startAt}`
      : null;

  if (key) {
    if (seenInBatch.has(key)) return "exact_duplicate";
    const sameKey = existing.filter(
      (e) =>
        e.externalAppointmentId === staged.externalAppointmentId &&
        e.startAt === staged.startAt
    );
    const active = sameKey.find((e) => e.recordState === "active");
    if (active) {
      const sameSubstance =
        active.trainerId === (staged.matchedTrainerId ?? null) &&
        active.serviceId === (staged.matchedServiceId ?? null) &&
        active.durationMinutes === (staged.durationMinutes ?? -1) &&
        active.canonicalStatus === (staged.canonicalStatus ?? "");
      if (sameSubstance) return "exact_duplicate";
      // same identity, different substance: status/duration changed at source
      const trainerOrServiceChanged =
        (staged.matchedTrainerId && active.trainerId !== staged.matchedTrainerId) ||
        (staged.matchedServiceId && active.serviceId !== staged.matchedServiceId);
      return trainerOrServiceChanged ? "conflict" : "source_update";
    }
    if (sameKey.some((e) => e.recordState === "reversed")) return "previously_reversed";
  }

  // fingerprint fallback (no external id): trainer + start + duration
  if (staged.startAt && staged.matchedTrainerId && staged.durationMinutes) {
    const fingerprintHit = existing.some(
      (e) =>
        e.recordState === "active" &&
        e.trainerId === staged.matchedTrainerId &&
        e.startAt === staged.startAt &&
        e.durationMinutes === staged.durationMinutes
    );
    if (fingerprintHit) return "possible_duplicate";
  }

  return "new";
}

/** Batch-local occurrence key for intra-file duplicate detection. */
export function occurrenceKey(staged: StagedOccurrence): string | null {
  return staged.externalAppointmentId && staged.startAt
    ? `${staged.externalAppointmentId}|${staged.startAt}`
    : null;
}
