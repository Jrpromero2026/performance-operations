import { parseCsv, rowToObject, MAX_IMPORT_ROWS } from "./csv";
import type { CsvParseIssue } from "./csv";
import { detectAdapter, detectSensitiveColumns } from "./adapters";
import { createGenericAdapter, CANONICAL_FIELDS } from "./adapters/generic";
import type { CanonicalField, ColumnMappings } from "./adapters/generic";
import { matchService, matchTrainer, occurrenceKey } from "./matching";
import type { MatchMethod, ServiceLookup, TrainerLookup } from "./matching";
import { normalizeText } from "./values";
import type { NormalizedRow, SourceAdapter } from "./types";

/**
 * Setup discovery — a READ-ONLY projection over an uploaded scheduling
 * export. Answers "what is in this file?" so the onboarding wizard can
 * offer trainers and services for review instead of asking an owner to
 * type them.
 *
 * This module introduces NO parsing rules, NO matching rules, and NO
 * database access. It runs the shipped parser (`parseCsv`), the shipped
 * adapter registry (`detectAdapter`), the shipped normalizers, and the
 * shipped matchers (`matchTrainer`, `matchService`) over rows held in
 * memory, then aggregates the results. Nothing here writes; creation
 * stays an explicit owner action through the existing server actions.
 *
 * Alias clustering is deliberately conservative: it groups only names
 * that reduce to an identical core after removing duration and filler
 * tokens. Abbreviations ("PT" → "Personal Training") carry business
 * meaning this code cannot know, so they are never auto-grouped — the
 * owner merges those explicitly.
 */

/** A trainer name observed in the file, with what we know about it. */
export interface DiscoveredTrainer {
  /** Name exactly as it appears in the source file. */
  sourceName: string;
  /** Normalized form used for grouping. */
  normalized: string;
  appointmentCount: number;
  /** Distinct trainer emails seen alongside this name. */
  emails: string[];
  /** Existing trainer this name already resolves to, if any. */
  existingId: string | null;
  existingName: string | null;
  matchMethod: MatchMethod;
  /** Merge suggestions when unmatched (never auto-applied). */
  candidates: { id: string; displayName: string }[];
  /** Suggested default action for the review list. */
  suggestedAction: "create" | "merge" | "linked";
}

/** A service name observed in the file. */
export interface DiscoveredService {
  sourceName: string;
  normalized: string;
  appointmentCount: number;
  existingId: string | null;
  existingName: string | null;
  matchMethod: MatchMethod;
  candidates: { id: string; displayName: string }[];
  suggestedAction: "create" | "merge" | "linked";
  /**
   * Conservative grouping key. Names sharing a key are offered as alias
   * candidates for one service; they are never merged automatically.
   */
  aliasGroup: string;
}

/** A cluster of source names that look like one service. */
export interface AliasCluster {
  aliasGroup: string;
  /** Longest member name, offered as the canonical service name. */
  suggestedCanonical: string;
  members: string[];
  totalAppointments: number;
}

export interface DiscoveredStatus {
  sourceStatus: string;
  count: number;
}

export interface DiscoveryReport {
  /** Rows parsed (excluding the header). */
  rowCount: number;
  /** Rows that produced no usable normalized content. */
  unusableRows: number;
  parseIssues: CsvParseIssue[];
  headers: string[];
  /** Columns whose names suggest personal data. */
  sensitiveColumns: string[];

  /** Detected source adapter, when confidence cleared the registry bar. */
  adapter: {
    source: string;
    version: string;
    displayName: string;
    confidence: number;
  } | null;
  /** True when no adapter detected and column mapping must be confirmed. */
  requiresColumnMapping: boolean;
  /** Header → canonical field proposals for the mapping fallback. */
  suggestedMappings: ColumnMappings;

  dateRange: { from: string; to: string } | null;
  /** Distinct timezones observed (adapter-provided). */
  timezones: string[];

  trainers: DiscoveredTrainer[];
  services: DiscoveredService[];
  aliasClusters: AliasCluster[];
  statuses: DiscoveredStatus[];

  /** Rows sharing an occurrence key with an earlier row in the file. */
  duplicateCandidates: number;

  totals: {
    trainersDetected: number;
    trainersNew: number;
    servicesDetected: number;
    servicesNew: number;
  };
}

export interface DiscoveryInput {
  csvText: string;
  organizationTimezone: string;
  /** Existing trainers in this organization (may be empty on first run). */
  trainers: TrainerLookup[];
  /** Existing services in this organization (may be empty on first run). */
  services: ServiceLookup[];
  /**
   * Confirmed column mapping, when the caller already has one (a saved
   * schema profile, or the owner's choice on the mapping fallback).
   */
  mappings?: ColumnMappings;
}

/** The part of a report derived purely from normalized rows. */
export interface RowAggregate {
  unusableRows: number;
  dateRange: { from: string; to: string } | null;
  timezones: string[];
  trainers: DiscoveredTrainer[];
  services: DiscoveredService[];
  aliasClusters: AliasCluster[];
  statuses: DiscoveredStatus[];
  duplicateCandidates: number;
  totals: DiscoveryReport["totals"];
}

/** Tokens that describe session length or packaging, not the service itself. */
const DURATION_TOKEN = /^(\d{1,3}(min|mins|minute|minutes|hr|hour|hours)?|min|mins|minute|minutes|hr|hrs|hour|hours)$/;
const FILLER_TOKENS = new Set(["session", "sessions", "appointment", "appointments", "the", "a", "and", "with", "for"]);

/**
 * Reduce a service name to a comparison core: normalized, with duration
 * and filler tokens removed, remaining tokens sorted. "Personal Training
 * 60" and "60 Min Personal Training" both reduce to "personal training".
 */
export function serviceAliasGroup(name: string): string {
  const tokens = normalizeText(name)
    .split(" ")
    .filter((t) => t.length > 0 && !DURATION_TOKEN.test(t) && !FILLER_TOKENS.has(t));
  if (tokens.length === 0) return normalizeText(name);
  return [...tokens].sort().join(" ");
}

/** Header-name heuristics proposing a canonical field for each column. */
export function suggestColumnMappings(headers: string[]): ColumnMappings {
  const rules: { field: CanonicalField; test: RegExp }[] = [
    { field: "external_appointment_id", test: /(appointment|booking).*(id|number)|^id$/i },
    { field: "external_client_id", test: /client.*(id|number)|customer.*(id|number)/i },
    { field: "appointment_date", test: /\bdate\b/i },
    { field: "time_range", test: /time.*(range|slot)|\bslot\b/i },
    { field: "start_time", test: /start|begin|\bfrom\b/i },
    { field: "end_time", test: /\bend\b|finish|\bto\b/i },
    { field: "duration_minutes", test: /duration|length|minutes/i },
    { field: "trainer_email", test: /(staff|trainer|coach|provider|employee).*mail/i },
    { field: "trainer_name", test: /staff|trainer|coach|provider|employee/i },
    { field: "client_email", test: /(client|customer|attendee).*mail/i },
    { field: "client_phone", test: /(client|customer).*(phone|mobile|cell)|^phone$|^mobile$/i },
    { field: "client_name", test: /client|customer|attendee|participant/i },
    { field: "service_name", test: /service|class|session type|appointment type|offering/i },
    { field: "status", test: /status|state|outcome/i },
    { field: "listed_price", test: /price|rate|cost|list/i },
    { field: "amount_paid", test: /paid|payment|amount|total/i },
    { field: "location", test: /location|room|site|studio/i },
    { field: "notes", test: /note|comment|remark/i },
  ];

  const used = new Set<CanonicalField>();
  const mappings: ColumnMappings = {};
  for (const header of headers) {
    const trimmed = header.trim();
    if (!trimmed) continue;
    const hit = rules.find((r) => !used.has(r.field) && r.test.test(trimmed));
    if (hit) {
      mappings[trimmed] = hit.field;
      used.add(hit.field);
    } else {
      mappings[trimmed] = "ignore";
    }
  }
  return mappings;
}

interface Accumulator {
  sourceName: string;
  normalized: string;
  count: number;
  emails: Set<string>;
}

function bump(map: Map<string, Accumulator>, rawName: string, email?: string): void {
  const normalized = normalizeText(rawName);
  if (!normalized) return;
  const entry = map.get(normalized) ?? {
    sourceName: rawName.trim(),
    normalized,
    count: 0,
    emails: new Set<string>(),
  };
  entry.count += 1;
  if (email && email.trim()) entry.emails.add(email.trim());
  map.set(normalized, entry);
}

/**
 * Aggregate normalized rows into discovery lists.
 *
 * Shared by both entry points so the wizard never computes the same
 * thing twice: `discoverFromCsv` feeds it rows it just parsed, and
 * `discoverFromNormalizedRows` feeds it rows the import pipeline already
 * staged and persisted.
 */
export function aggregateRows(
  rows: NormalizedRow[],
  trainers: TrainerLookup[],
  services: ServiceLookup[]
): RowAggregate {
  const trainerMap = new Map<string, Accumulator>();
  const serviceMap = new Map<string, Accumulator>();
  const statusCounts = new Map<string, number>();
  const timezones = new Set<string>();
  const seenKeys = new Set<string>();

  let unusableRows = 0;
  let duplicateCandidates = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const normalized of rows) {
    const hasContent =
      normalized.sourceTrainerName ||
      normalized.sourceServiceName ||
      normalized.appointmentDate ||
      normalized.startAt;
    if (!hasContent) {
      unusableRows += 1;
      continue;
    }

    if (normalized.sourceTrainerName) {
      bump(trainerMap, normalized.sourceTrainerName, normalized.sourceTrainerEmail);
    }
    if (normalized.sourceServiceName) {
      bump(serviceMap, normalized.sourceServiceName);
    }
    if (normalized.sourceStatus) {
      const status = normalized.sourceStatus.trim();
      if (status) statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    }
    if (normalized.timezone) timezones.add(normalized.timezone);

    if (normalized.appointmentDate) {
      if (!minDate || normalized.appointmentDate < minDate) minDate = normalized.appointmentDate;
      if (!maxDate || normalized.appointmentDate > maxDate) maxDate = normalized.appointmentDate;
    }

    // Intra-file duplicate candidates only. Cross-batch classification
    // needs posted occurrences and stays in the import pipeline.
    const key = occurrenceKey({
      externalAppointmentId: normalized.externalAppointmentId,
      startAt: normalized.startAt,
    });
    if (key) {
      if (seenKeys.has(key)) duplicateCandidates += 1;
      else seenKeys.add(key);
    }
  }

  const discoveredTrainers = [...trainerMap.values()]
    .map((entry) => resolveTrainer(entry, trainers))
    .sort((a, b) => b.appointmentCount - a.appointmentCount || a.sourceName.localeCompare(b.sourceName));

  const discoveredServices = [...serviceMap.values()]
    .map((entry) => resolveService(entry, services))
    .sort((a, b) => b.appointmentCount - a.appointmentCount || a.sourceName.localeCompare(b.sourceName));

  return {
    unusableRows,
    dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : null,
    timezones: [...timezones].sort(),
    trainers: discoveredTrainers,
    services: discoveredServices,
    aliasClusters: buildAliasClusters(discoveredServices),
    statuses: [...statusCounts.entries()]
      .map(([sourceStatus, count]) => ({ sourceStatus, count }))
      .sort((a, b) => b.count - a.count || a.sourceStatus.localeCompare(b.sourceStatus)),
    duplicateCandidates,
    totals: {
      trainersDetected: discoveredTrainers.length,
      trainersNew: discoveredTrainers.filter((t) => t.existingId === null).length,
      servicesDetected: discoveredServices.length,
      servicesNew: discoveredServices.filter((s) => s.existingId === null).length,
    },
  };
}

/**
 * Analyze an export without importing it.
 *
 * Pure with respect to the database: the caller supplies existing
 * trainers and services, and receives a report. No batch is created, no
 * row is staged, nothing is written.
 */
export function discoverFromCsv(input: DiscoveryInput): DiscoveryReport {
  const { csvText, organizationTimezone, trainers, services } = input;

  const parsed = parseCsv(csvText, { maxRows: MAX_IMPORT_ROWS });
  const headers = parsed.headers.map((h) => h.trim());
  const detection = detectAdapter(headers);

  const suggestedMappings = input.mappings ?? suggestColumnMappings(headers);
  let adapter: SourceAdapter | null = detection.adapter;
  let requiresColumnMapping = false;
  if (!adapter) {
    // No registered adapter recognised these headers. Fall back to the
    // shipped mapping-driven adapter using the confirmed or proposed
    // mapping, and tell the caller the mapping needs confirmation.
    adapter = createGenericAdapter(suggestedMappings);
    requiresColumnMapping = input.mappings === undefined;
  }

  const normalizedRows = parsed.rows.map(
    (row) =>
      adapter.normalizeRow(rowToObject(parsed.headers, row), {
        organizationTimezone,
      }).normalized
  );

  return {
    rowCount: parsed.rows.length,
    parseIssues: parsed.issues,
    headers,
    sensitiveColumns: detectSensitiveColumns(headers),
    adapter: detection.adapter
      ? {
          source: detection.adapter.source,
          version: detection.adapter.version,
          displayName: detection.adapter.displayName,
          confidence: detection.confidence,
        }
      : null,
    requiresColumnMapping,
    suggestedMappings,
    ...aggregateRows(normalizedRows, trainers, services),
  };
}

/**
 * Discovery over rows the import pipeline already staged.
 *
 * The wizard's trainer and service steps use this: `import_rows`
 * persists `normalized_row` at staging time, so the review screens read
 * what the pipeline already computed rather than re-downloading and
 * re-parsing the original file on every page render.
 */
export function discoverFromNormalizedRows(
  rows: NormalizedRow[],
  trainers: TrainerLookup[],
  services: ServiceLookup[]
): RowAggregate {
  return aggregateRows(rows, trainers, services);
}

function resolveTrainer(entry: Accumulator, trainers: TrainerLookup[]): DiscoveredTrainer {
  const row: NormalizedRow = {
    sourceTrainerName: entry.sourceName,
    sourceTrainerEmail: [...entry.emails][0],
  };
  const outcome = matchTrainer(row, trainers);
  return {
    sourceName: entry.sourceName,
    normalized: entry.normalized,
    appointmentCount: entry.count,
    emails: [...entry.emails].sort(),
    existingId: outcome.matched?.id ?? null,
    existingName: outcome.matched?.displayName ?? null,
    matchMethod: outcome.method,
    candidates: outcome.candidates.map((c) => ({ id: c.id, displayName: c.displayName })),
    suggestedAction: outcome.matched
      ? "linked"
      : outcome.candidates.length > 0
        ? "merge"
        : "create",
  };
}

function resolveService(entry: Accumulator, services: ServiceLookup[]): DiscoveredService {
  const row: NormalizedRow = { sourceServiceName: entry.sourceName };
  const outcome = matchService(row, services);
  return {
    sourceName: entry.sourceName,
    normalized: entry.normalized,
    appointmentCount: entry.count,
    existingId: outcome.matched?.id ?? null,
    existingName: outcome.matched?.displayName ?? null,
    matchMethod: outcome.method,
    candidates: outcome.candidates.map((c) => ({ id: c.id, displayName: c.displayName })),
    suggestedAction: outcome.matched
      ? "linked"
      : outcome.candidates.length > 0
        ? "merge"
        : "create",
    aliasGroup: serviceAliasGroup(entry.sourceName),
  };
}

/** Group discovered services that reduce to the same core name. */
function buildAliasClusters(services: DiscoveredService[]): AliasCluster[] {
  const groups = new Map<string, DiscoveredService[]>();
  for (const service of services) {
    const existing = groups.get(service.aliasGroup) ?? [];
    existing.push(service);
    groups.set(service.aliasGroup, existing);
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([aliasGroup, members]) => ({
      aliasGroup,
      suggestedCanonical: [...members]
        .sort((a, b) => b.sourceName.length - a.sourceName.length)[0].sourceName,
      members: members.map((m) => m.sourceName).sort(),
      totalAppointments: members.reduce((sum, m) => sum + m.appointmentCount, 0),
    }))
    .sort((a, b) => b.totalAppointments - a.totalAppointments);
}

/** Canonical field list re-exported for mapping UIs. */
export { CANONICAL_FIELDS };
export type { CanonicalField, ColumnMappings };
