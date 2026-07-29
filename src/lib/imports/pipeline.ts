import { createHash } from "node:crypto";
import type { ActorContext } from "@/lib/actions/shared";
import type { Json } from "@/lib/supabase/types";
import { rowToObject, type CsvParseResult } from "./csv";
import {
  classifyDuplicate,
  matchClient,
  matchService,
  matchTrainer,
  matchTrainerBySourceId,
  occurrenceKey,
  type ClientLookup,
  type ExistingOccurrence,
  type ServiceLookup,
  type TrainerLookup,
} from "./matching";
import { normalizeText } from "./values";
import type { NormalizedRow, RowIssue, SourceAdapter } from "./types";

/**
 * Server-side import pipeline. All heavy work happens here in CHUNKS
 * (database writes batched at CHUNK_SIZE) so 10k-row files stay well within
 * request limits; the client never parses authoritative data.
 */

const CHUNK_SIZE = 500;

/** Issue codes owned by the matching pass (superseded + regenerated on re-run). */
const MATCH_ISSUE_CODES = [
  "unmatched_trainer",
  "ambiguous_trainer",
  "unmatched_service",
  "unmatched_client",
  "ambiguous_client",
  "unknown_source_status",
  "possible_duplicate",
  "exact_duplicate",
  "duplicate_conflict",
  "source_update_candidate",
  "previously_reversed",
];

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/* ------------------------------------------------------------------ stage */

export interface StageResult {
  totalRows: number;
  parseIssueCount: number;
}

/**
 * Parse + normalize + persist raw rows for a batch (status: parsing →
 * validating). Original row objects are stored verbatim; blank values stay
 * "" while absent columns are absent keys.
 */
export async function stageBatch(
  actor: ActorContext,
  batch: { id: string; organization_id: string },
  parsed: CsvParseResult,
  adapter: SourceAdapter,
  organizationTimezone: string
): Promise<StageResult> {
  const { supabase } = actor;

  await transition(actor, batch.id, batch.organization_id, "parsing");
  await supabase
    .from("import_batches")
    .update({ parsing_started_at: new Date().toISOString(), adapter_version: adapter.version })
    .eq("id", batch.id);

  interface RowInsert {
    import_batch_id: string;
    organization_id: string;
    source_row_number: number;
    original_row: Json;
    normalized_row: Json;
    row_hash: string;
    processing_status: string;
    appointment_date: string | null;
    start_at: string | null;
    end_at: string | null;
    duration_minutes: number | null;
    external_appointment_id: string | null;
    listed_price_cents: number | null;
    amount_paid_cents: number | null;
  }
  interface IssueSeed {
    rowNumber: number;
    issue: RowIssue;
  }

  const inserts: RowInsert[] = [];
  const issueSeeds: IssueSeed[] = [];

  parsed.rows.forEach((raw, index) => {
    const rowNumber = index + 1;
    const original = rowToObject(parsed.headers, raw);
    const { normalized, issues } = adapter.normalizeRow(original, {
      organizationTimezone,
    });
    inserts.push({
      import_batch_id: batch.id,
      organization_id: batch.organization_id,
      source_row_number: rowNumber,
      original_row: original as unknown as Json,
      normalized_row: normalized as unknown as Json,
      row_hash: sha256Hex(JSON.stringify(original)),
      processing_status: "pending",
      appointment_date: normalized.appointmentDate ?? null,
      start_at: normalized.startAt ?? null,
      end_at: normalized.endAt ?? null,
      duration_minutes: normalized.durationMinutes ?? null,
      external_appointment_id: normalized.externalAppointmentId ?? null,
      listed_price_cents: normalized.listedPriceCents ?? null,
      amount_paid_cents: normalized.amountPaidCents ?? null,
    });
    for (const issue of issues) issueSeeds.push({ rowNumber, issue });
  });

  // chunked row inserts, then map row-number → id for issue inserts
  for (let i = 0; i < inserts.length; i += CHUNK_SIZE) {
    const { error } = await supabase
      .from("import_rows")
      .insert(inserts.slice(i, i + CHUNK_SIZE));
    if (error) throw new Error(`row_insert_failed:${error.code}`);
  }

  const { data: idRows, error: idError } = await supabase
    .from("import_rows")
    .select("id, source_row_number")
    .eq("import_batch_id", batch.id);
  if (idError || !idRows) throw new Error("row_id_load_failed");
  const idByNumber = new Map(idRows.map((r) => [r.source_row_number, r.id]));

  const issueInserts = issueSeeds.flatMap(({ rowNumber, issue }) => {
    const rowId = idByNumber.get(rowNumber);
    if (!rowId) return [];
    return [
      {
        import_row_id: rowId,
        import_batch_id: batch.id,
        organization_id: batch.organization_id,
        code: issue.code,
        severity: issue.severity,
        field: issue.field ?? null,
        message: issue.message,
        original_value: issue.originalValue ?? null,
        suggested_action: issue.suggestedAction ?? null,
      },
    ];
  });
  for (let i = 0; i < issueInserts.length; i += CHUNK_SIZE) {
    const { error } = await supabase
      .from("import_row_issues")
      .insert(issueInserts.slice(i, i + CHUNK_SIZE));
    if (error) throw new Error(`issue_insert_failed:${error.code}`);
  }

  await supabase
    .from("import_batches")
    .update({
      parsing_completed_at: new Date().toISOString(),
      total_row_count: inserts.length,
      metadata: {
        parse_issues: parsed.issues.map((i) => ({ code: i.code, row: i.rowNumber ?? null })),
        delimiter: parsed.delimiter,
        had_bom: parsed.hadBom,
        timezone_assumption: organizationTimezone,
      } as unknown as Json,
    })
    .eq("id", batch.id);
  await transition(actor, batch.id, batch.organization_id, "validating");

  return { totalRows: inserts.length, parseIssueCount: parsed.issues.length };
}

/* --------------------------------------------------------------- matching */

export interface MatchingLookups {
  trainers: TrainerLookup[];
  services: ServiceLookup[];
  clients: ClientLookup[];
  statusMappings: Map<string, string>;
  existing: ExistingOccurrence[];
}

/** Load org-scoped lookups once per batch (no N+1 queries). */
export async function loadLookups(
  actor: ActorContext,
  organizationId: string,
  source: string
): Promise<MatchingLookups> {
  const { supabase } = actor;

  const [trainerAssign, aliases, servicesRes, serviceAliases, clientAssign, clientIds, mappings, existingRes] =
    await Promise.all([
      supabase
        .from("trainer_organization_assignments")
        .select("trainer_id, trainers ( id, display_name, email, source_identifiers )")
        .eq("organization_id", organizationId)
        .is("effective_to", null),
      supabase
        .from("trainer_source_aliases")
        .select("trainer_id, alias_normalized")
        .eq("organization_id", organizationId)
        .eq("source", source),
      supabase
        .from("services")
        .select("id, internal_name, display_name, status")
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase
        .from("service_source_aliases")
        .select("service_id, alias_normalized")
        .eq("organization_id", organizationId)
        .eq("source", source),
      supabase
        .from("client_organization_assignments")
        .select("client_id, clients ( id, display_name, email, phone )")
        .eq("organization_id", organizationId)
        .is("effective_to", null),
      supabase
        .from("client_source_identifiers")
        .select("client_id, external_id")
        .eq("organization_id", organizationId)
        .eq("source", source),
      supabase
        .from("source_status_mappings")
        .select("source_value_normalized, canonical_status")
        .eq("organization_id", organizationId)
        .eq("source", source),
      supabase
        .from("appointments")
        .select("external_appointment_id, start_at, trainer_id, service_id, canonical_status, duration_minutes, record_state")
        .eq("organization_id", organizationId)
        .eq("source", source),
    ]);

  const aliasByTrainer = new Map<string, string[]>();
  for (const a of aliases.data ?? []) {
    if (!a.alias_normalized) continue;
    (aliasByTrainer.get(a.trainer_id) ?? aliasByTrainer.set(a.trainer_id, []).get(a.trainer_id))!.push(
      a.alias_normalized
    );
  }
  interface TrainerJoinRow {
    trainer_id: string;
    trainers: {
      id: string;
      display_name: string;
      email: string | null;
      source_identifiers: Record<string, string>;
    } | null;
  }
  const trainers: TrainerLookup[] = ((trainerAssign.data ?? []) as unknown as TrainerJoinRow[]).flatMap(
    (row) => {
      const t = row.trainers;
      if (!t) return [];
      return [
        {
          id: t.id,
          displayName: t.display_name,
          email: t.email,
          sourceId:
            (t.source_identifiers as Record<string, string> | null)?.[source] ?? null,
          aliases: aliasByTrainer.get(t.id) ?? [],
        },
      ];
    }
  );

  const aliasByService = new Map<string, string[]>();
  for (const a of serviceAliases.data ?? []) {
    if (!a.alias_normalized) continue;
    (aliasByService.get(a.service_id) ?? aliasByService.set(a.service_id, []).get(a.service_id))!.push(
      a.alias_normalized
    );
  }
  const services: ServiceLookup[] = (servicesRes.data ?? []).map((s) => ({
    id: s.id,
    internalName: s.internal_name,
    displayName: s.display_name,
    aliases: aliasByService.get(s.id) ?? [],
    departmentId: null,
  }));

  const sourceIdByClient = new Map<string, string>();
  for (const c of clientIds.data ?? []) sourceIdByClient.set(c.client_id, c.external_id);
  interface ClientJoinRow {
    client_id: string;
    clients: { id: string; display_name: string; email: string | null; phone: string | null } | null;
  }
  const clients: ClientLookup[] = ((clientAssign.data ?? []) as unknown as ClientJoinRow[]).flatMap(
    (row) => {
      const c = row.clients;
      if (!c) return [];
      return [
        {
          id: c.id,
          displayName: c.display_name,
          email: c.email,
          phone: c.phone,
          sourceId: sourceIdByClient.get(c.id) ?? null,
        },
      ];
    }
  );

  const statusMappings = new Map<string, string>(
    (mappings.data ?? []).map((m) => [m.source_value_normalized, m.canonical_status])
  );

  const existing: ExistingOccurrence[] = (existingRes.data ?? []).map((a) => ({
    externalAppointmentId: a.external_appointment_id,
    startAt: a.start_at,
    trainerId: a.trainer_id,
    serviceId: a.service_id,
    canonicalStatus: a.canonical_status,
    durationMinutes: a.duration_minutes,
    recordState: a.record_state as ExistingOccurrence["recordState"],
  }));

  return { trainers, services, clients, statusMappings, existing };
}

/**
 * Run (or re-run) matching + duplicate classification for every non-excluded,
 * non-posted row, regenerate matching issues, update per-row counts, and set
 * the batch status to needs_review or ready_for_approval.
 */
export async function runMatching(
  actor: ActorContext,
  batch: { id: string; organization_id: string; source: string; status: string }
): Promise<void> {
  const { supabase } = actor;

  if (batch.status === "needs_review" || batch.status === "ready_for_approval") {
    await transition(actor, batch.id, batch.organization_id, "validating");
  }

  const lookups = await loadLookups(actor, batch.organization_id, batch.source);

  // Supersede previous matching-pass issues that are still open.
  await supabase
    .from("import_row_issues")
    .update({
      resolution_status: "resolved",
      resolution_note: "Superseded by a matching re-run.",
      resolved_at: new Date().toISOString(),
    })
    .eq("import_batch_id", batch.id)
    .in("code", MATCH_ISSUE_CODES)
    .eq("resolution_status", "open");

  const { data: rows, error } = await supabase
    .from("import_rows")
    .select("*")
    .eq("import_batch_id", batch.id)
    .not("processing_status", "in", '("excluded","posted")')
    .order("source_row_number");
  if (error || !rows) throw new Error("rows_load_failed");

  const seenInBatch = new Set<string>();
  const newIssues: Array<{
    import_row_id: string;
    import_batch_id: string;
    organization_id: string;
    code: string;
    severity: string;
    field: string | null;
    message: string;
    original_value: string | null;
    suggested_action: string | null;
  }> = [];

  for (const row of rows) {
    const normalized = row.normalized_row as unknown as NormalizedRow;
    const corrections = row.corrections as Record<string, unknown>;

    // trainer
    let trainerId = (corrections.matched_trainer_id as string | undefined) ?? null;
    let trainerMethod = trainerId ? "manual" : null;
    if (!trainerId) {
      const bySourceId = matchTrainerBySourceId(undefined, lookups.trainers);
      const outcome = bySourceId
        ? { matched: bySourceId, method: "source_id" as const, candidates: [], requiresReview: false }
        : matchTrainer(normalized, lookups.trainers);
      trainerId = outcome.matched?.id ?? null;
      trainerMethod = outcome.matched ? outcome.method : null;
      if (!outcome.matched) {
        newIssues.push({
          import_row_id: row.id,
          import_batch_id: batch.id,
          organization_id: batch.organization_id,
          code: outcome.candidates.length > 1 ? "ambiguous_trainer" : "unmatched_trainer",
          severity: "blocking",
          field: "trainer",
          message:
            outcome.candidates.length > 0
              ? `Trainer "${normalized.sourceTrainerName ?? ""}" matches ${outcome.candidates.length} candidate(s) — resolve manually.`
              : `Trainer "${normalized.sourceTrainerName ?? ""}" has no match in this organization.`,
          original_value: normalized.sourceTrainerName ?? null,
          suggested_action: "Map to an existing trainer or save an alias.",
        });
      }
    }

    // service
    let serviceId = (corrections.matched_service_id as string | undefined) ?? null;
    let serviceMethod = serviceId ? "manual" : null;
    if (!serviceId) {
      const outcome = matchService(normalized, lookups.services);
      serviceId = outcome.matched?.id ?? null;
      serviceMethod = outcome.matched ? outcome.method : null;
      if (!outcome.matched) {
        newIssues.push({
          import_row_id: row.id,
          import_batch_id: batch.id,
          organization_id: batch.organization_id,
          code: "unmatched_service",
          severity: "blocking",
          field: "service",
          message: `Service "${normalized.sourceServiceName ?? ""}" has no alias or name match.`,
          original_value: normalized.sourceServiceName ?? null,
          suggested_action: "Map to an existing service (optionally saving an alias).",
        });
      }
    }

    // client (unmatched client is a WARNING, not blocking)
    let clientId = (corrections.matched_client_id as string | undefined) ?? null;
    let clientMethod = clientId ? "manual" : null;
    if (!clientId) {
      const outcome = matchClient(normalized, lookups.clients);
      clientId = outcome.matched?.id ?? null;
      clientMethod = outcome.matched ? outcome.method : null;
      if (!outcome.matched && (normalized.sourceClientName || normalized.sourceClientEmail)) {
        newIssues.push({
          import_row_id: row.id,
          import_batch_id: batch.id,
          organization_id: batch.organization_id,
          code: outcome.candidates.length > 0 ? "ambiguous_client" : "unmatched_client",
          severity: "warning",
          field: "client",
          message:
            outcome.candidates.length > 0
              ? "Client matches an existing record by name only — confirm the link."
              : "Client has no match; link or create a client, or accept posting without one.",
          original_value: null, // never client PII in aggregate lists
          suggested_action: "Link an existing client or create one.",
        });
      }
    }

    // status
    let canonicalStatus = (corrections.canonical_status as string | undefined) ?? null;
    if (!canonicalStatus) {
      const raw = normalized.sourceStatus ? normalizeText(normalized.sourceStatus) : null;
      canonicalStatus = raw ? lookups.statusMappings.get(raw) ?? null : null;
      if (!canonicalStatus) {
        canonicalStatus = "unknown";
        newIssues.push({
          import_row_id: row.id,
          import_batch_id: batch.id,
          organization_id: batch.organization_id,
          code: "unknown_source_status",
          severity: "warning",
          field: "status",
          message: `Source status "${normalized.sourceStatus ?? "(blank)"}" has no mapping; row maps to \`unknown\`.`,
          original_value: normalized.sourceStatus ?? null,
          suggested_action: "Add a status mapping for this organization and source.",
        });
      }
    }

    // duplicates
    const staged = {
      externalAppointmentId: row.external_appointment_id ?? undefined,
      startAt: row.start_at ?? undefined,
      matchedTrainerId: trainerId,
      matchedServiceId: serviceId,
      canonicalStatus,
      durationMinutes: row.duration_minutes ?? undefined,
    };
    let duplicateClass = (corrections.duplicate_class as string | undefined) ?? null;
    if (!duplicateClass) {
      duplicateClass = classifyDuplicate(staged, lookups.existing, seenInBatch);
      if (duplicateClass !== "new") {
        const severity = duplicateClass === "exact_duplicate" ? "blocking" : "warning";
        const codeByClass: Record<string, string> = {
          exact_duplicate: "exact_duplicate",
          possible_duplicate: "possible_duplicate",
          source_update: "source_update_candidate",
          conflict: "duplicate_conflict",
          previously_reversed: "previously_reversed",
        };
        newIssues.push({
          import_row_id: row.id,
          import_batch_id: batch.id,
          organization_id: batch.organization_id,
          code: codeByClass[duplicateClass],
          severity,
          field: "external_appointment_id",
          message:
            duplicateClass === "exact_duplicate"
              ? "This occurrence is already posted (or repeated within this file) with identical substance."
              : duplicateClass === "possible_duplicate"
                ? "An active appointment with the same trainer, start, and duration already exists."
                : duplicateClass === "conflict"
                  ? "An active appointment with this ID and start exists with a DIFFERENT trainer or service."
                  : duplicateClass === "previously_reversed"
                    ? "A previously reversed appointment matches this occurrence."
                    : "An active appointment with this ID and start exists with different details (source update).",
          original_value: row.external_appointment_id,
          suggested_action:
            duplicateClass === "exact_duplicate"
              ? "Exclude the row (it cannot post twice)."
              : "Review and confirm duplicate or not-duplicate.",
        });
      }
    }
    const key = occurrenceKey(staged);
    if (key) seenInBatch.add(key);

    await supabase
      .from("import_rows")
      .update({
        matched_trainer_id: trainerId,
        trainer_match_method: trainerMethod,
        matched_service_id: serviceId,
        service_match_method: serviceMethod,
        matched_client_id: clientId,
        client_match_method: clientMethod,
        canonical_status: canonicalStatus,
        duplicate_class: duplicateClass,
      })
      .eq("id", row.id);
  }

  for (let i = 0; i < newIssues.length; i += CHUNK_SIZE) {
    const { error: issueError } = await supabase
      .from("import_row_issues")
      .insert(newIssues.slice(i, i + CHUNK_SIZE));
    if (issueError) throw new Error(`issue_insert_failed:${issueError.code}`);
  }

  await reconcileBatch(actor, batch.id, batch.organization_id);
}

/**
 * Recompute per-row issue counts + processing status, batch counters, and
 * the batch review state. Called after matching and after every resolution.
 */
export async function reconcileBatch(
  actor: ActorContext,
  batchId: string,
  organizationId: string
): Promise<void> {
  const { supabase } = actor;

  const [{ data: rows }, { data: issues }] = await Promise.all([
    supabase
      .from("import_rows")
      .select("id, processing_status, duplicate_class")
      .eq("import_batch_id", batchId),
    supabase
      .from("import_row_issues")
      .select("import_row_id, severity, resolution_status")
      .eq("import_batch_id", batchId),
  ]);
  if (!rows) return;

  const openBlocking = new Map<string, number>();
  const openWarning = new Map<string, number>();
  const infoCount = new Map<string, number>();
  for (const issue of issues ?? []) {
    if (issue.severity === "info") {
      infoCount.set(issue.import_row_id, (infoCount.get(issue.import_row_id) ?? 0) + 1);
    } else if (issue.resolution_status === "open") {
      const map = issue.severity === "blocking" ? openBlocking : openWarning;
      map.set(issue.import_row_id, (map.get(issue.import_row_id) ?? 0) + 1);
    }
  }

  let accepted = 0;
  let warned = 0;
  let blocked = 0;
  let duplicates = 0;
  let excluded = 0;

  for (const row of rows) {
    if (row.processing_status === "excluded") {
      excluded++;
      continue;
    }
    if (row.processing_status === "posted") continue;
    const blocking = openBlocking.get(row.id) ?? 0;
    const warnings = openWarning.get(row.id) ?? 0;
    const unresolvedDuplicate =
      row.duplicate_class !== null && row.duplicate_class !== "new";
    if (unresolvedDuplicate) duplicates++;
    const nextStatus = blocking > 0 || unresolvedDuplicate ? "needs_review" : "ready";
    if (nextStatus === "ready") {
      accepted++;
      if (warnings > 0) warned++;
    } else {
      blocked++;
    }
    if (row.processing_status !== nextStatus) {
      await supabase
        .from("import_rows")
        .update({
          processing_status: nextStatus,
          blocking_issue_count: blocking,
          warning_count: warnings,
          info_count: infoCount.get(row.id) ?? 0,
        })
        .eq("id", row.id);
    } else {
      await supabase
        .from("import_rows")
        .update({
          blocking_issue_count: blocking,
          warning_count: warnings,
          info_count: infoCount.get(row.id) ?? 0,
        })
        .eq("id", row.id);
    }
  }

  const { data: batch } = await supabase
    .from("import_batches")
    .select("status")
    .eq("id", batchId)
    .maybeSingle();

  await supabase
    .from("import_batches")
    .update({
      accepted_row_count: accepted,
      warning_row_count: warned,
      blocked_row_count: blocked,
      duplicate_row_count: duplicates,
      excluded_row_count: excluded,
    })
    .eq("id", batchId);

  // Review-state resolution (only while in the review part of the lifecycle).
  if (batch && ["validating", "needs_review", "ready_for_approval"].includes(batch.status)) {
    const target = blocked > 0 ? "needs_review" : "ready_for_approval";
    if (batch.status !== target) {
      await transition(actor, batchId, organizationId, target);
    }
  }
}

/** Perform a batch state transition + event row (trigger enforces legality). */
export async function transition(
  actor: ActorContext,
  batchId: string,
  organizationId: string,
  toStatus: string,
  reason?: string
): Promise<void> {
  const { supabase } = actor;
  const { data: current } = await supabase
    .from("import_batches")
    .select("status")
    .eq("id", batchId)
    .maybeSingle();
  if (!current || current.status === toStatus) return;
  const { error } = await supabase
    .from("import_batches")
    .update({ status: toStatus })
    .eq("id", batchId);
  if (error) throw new Error(`transition_failed:${current.status}->${toStatus}`);
  await supabase.from("import_batch_events").insert({
    import_batch_id: batchId,
    organization_id: organizationId,
    from_status: current.status,
    to_status: toStatus,
    actor_id: actor.userId,
    reason: reason ?? null,
  });
}
