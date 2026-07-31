import { discoverFromNormalizedRows } from "@/lib/imports/discovery";
import type { RowAggregate } from "@/lib/imports/discovery";
import { loadLookups } from "@/lib/imports/pipeline";
import type { NormalizedRow } from "@/lib/imports/types";
import type { ActorContext } from "@/lib/actions/shared";

/**
 * Server-side discovery for the wizard's review steps.
 *
 * Reads what the import pipeline already staged — `import_rows` persists
 * `normalized_row` at staging time — and reuses `loadLookups` for the
 * org-scoped trainer and service lookups. Nothing is re-downloaded,
 * re-parsed, or re-matched, and no query duplicates one the pipeline
 * already runs.
 */

export interface SetupDiscovery extends RowAggregate {
  batchId: string;
  batchFilename: string;
  batchStatus: string;
  source: string;
  rowCount: number;
}

/** The batch the wizard's review steps read from: the most recent upload. */
export async function getLatestBatchDiscovery(
  actor: ActorContext,
  organizationId: string
): Promise<SetupDiscovery | null> {
  const { data: batch } = await actor.supabase
    .from("import_batches")
    .select("id, original_filename, status, source")
    .eq("organization_id", organizationId)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!batch) return null;

  const { data: rows } = await actor.supabase
    .from("import_rows")
    .select("normalized_row")
    .eq("import_batch_id", batch.id)
    .eq("organization_id", organizationId);

  const normalized = (rows ?? []).map(
    (row) => (row.normalized_row ?? {}) as NormalizedRow
  );

  const lookups = await loadLookups(actor, organizationId, batch.source);
  const aggregate = discoverFromNormalizedRows(
    normalized,
    lookups.trainers,
    lookups.services
  );

  return {
    ...aggregate,
    batchId: batch.id,
    batchFilename: batch.original_filename,
    batchStatus: batch.status,
    source: batch.source,
    rowCount: normalized.length,
  };
}
