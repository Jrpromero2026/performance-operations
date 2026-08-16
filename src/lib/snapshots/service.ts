/**
 * Organizational-snapshot reads. Server-side; every query runs through
 * the caller's RLS client, so authorization is enforced by the database
 * and this module never widens it.
 */

import type { ActorContext } from "@/lib/actions/shared";
import type { SnapshotProvenance } from "./provenance";

export interface SnapshotMetricDefinition {
  key: string;
  label: string;
  unit: string;
  definition: string;
  rationale: string;
  sourceKey: string;
  sortOrder: number;
  isActive: boolean;
}

export interface SnapshotValue {
  metricKey: string;
  value: number;
}

export interface OrganizationalSnapshot {
  id: string;
  organizationId: string;
  sourceKey: string;
  sourceLabel: string;
  ingestMode: string;
  periodStart: string;
  periodEnd: string;
  asOfDate: string;
  status: "recorded" | "superseded" | "voided";
  supersededById: string | null;
  note: string | null;
  enteredByName: string | null;
  enteredAt: string;
  values: SnapshotValue[];
}

interface SnapshotRow {
  id: string;
  organization_id: string;
  source_key: string;
  period_start: string;
  period_end: string;
  as_of_date: string;
  status: string;
  superseded_by_id: string | null;
  note: string | null;
  entered_by: string;
  entered_at: string;
  external_data_sources: { label: string; ingest_mode: string } | null;
  profiles: { full_name: string | null } | null;
}

export async function listSnapshotMetricDefinitions(
  actor: ActorContext
): Promise<SnapshotMetricDefinition[]> {
  const { data } = await actor.supabase
    .from("organizational_metric_definitions")
    .select("key, label, unit, definition, rationale, source_key, sort_order, is_active")
    .order("sort_order");
  return (data ?? []).map((row) => ({
    key: row.key,
    label: row.label,
    unit: row.unit,
    definition: row.definition,
    rationale: row.rationale,
    sourceKey: row.source_key,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
}

/**
 * Snapshot history, newest period first. Superseded and voided rows are
 * included by default: history is the product, and hiding a corrected
 * reading would defeat the point of storing both.
 */
export async function listSnapshots(
  actor: ActorContext,
  organizationId: string,
  options: { limit?: number; recordedOnly?: boolean } = {}
): Promise<OrganizationalSnapshot[]> {
  let query = actor.supabase
    .from("organizational_snapshots")
    .select(
      "id, organization_id, source_key, period_start, period_end, as_of_date, status, superseded_by_id, note, entered_by, entered_at, external_data_sources ( label, ingest_mode ), profiles!organizational_snapshots_entered_by_fkey ( full_name )"
    )
    .eq("organization_id", organizationId)
    .order("period_end", { ascending: false })
    .order("as_of_date", { ascending: false });
  if (options.recordedOnly) query = query.eq("status", "recorded");
  if (options.limit) query = query.limit(options.limit);

  const { data } = await query;
  const rows = (data ?? []) as unknown as SnapshotRow[];
  if (rows.length === 0) return [];

  const { data: valueRows } = await actor.supabase
    .from("organizational_snapshot_values")
    .select("snapshot_id, metric_key, value")
    .in(
      "snapshot_id",
      rows.map((r) => r.id)
    );

  const valuesBySnapshot = new Map<string, SnapshotValue[]>();
  for (const row of valueRows ?? []) {
    const list = valuesBySnapshot.get(row.snapshot_id) ?? [];
    list.push({ metricKey: row.metric_key, value: Number(row.value) });
    valuesBySnapshot.set(row.snapshot_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    sourceKey: row.source_key,
    sourceLabel: row.external_data_sources?.label ?? row.source_key,
    ingestMode: row.external_data_sources?.ingest_mode ?? "manual_snapshot",
    periodStart: row.period_start,
    periodEnd: row.period_end,
    asOfDate: row.as_of_date,
    status: row.status as OrganizationalSnapshot["status"],
    supersededById: row.superseded_by_id,
    note: row.note,
    enteredByName: row.profiles?.full_name ?? null,
    enteredAt: row.entered_at,
    values: (valuesBySnapshot.get(row.id) ?? []).sort((a, b) =>
      a.metricKey.localeCompare(b.metricKey)
    ),
  }));
}

/**
 * The snapshot a report should quote for a source: the most recent
 * RECORDED reading. Superseded and voided readings are never "latest" —
 * that is the whole purpose of those states.
 */
export function latestRecordedSnapshot(
  snapshots: OrganizationalSnapshot[],
  sourceKey: string
): OrganizationalSnapshot | null {
  const candidates = snapshots
    .filter((s) => s.sourceKey === sourceKey && s.status === "recorded")
    .sort((a, b) => (a.asOfDate < b.asOfDate ? 1 : a.asOfDate > b.asOfDate ? -1 : 0));
  return candidates[0] ?? null;
}

export function toProvenance(snapshot: OrganizationalSnapshot | null, sourceLabel: string, sourceKey: string): SnapshotProvenance {
  if (!snapshot) {
    return {
      mode: "unavailable",
      sourceKey,
      sourceLabel,
      asOfDate: "",
      periodStart: "",
      periodEnd: "",
      enteredByName: null,
      enteredAt: "",
      note: null,
    };
  }
  return {
    mode: snapshot.ingestMode === "automated" ? "live_automated" : "manual_snapshot",
    sourceKey: snapshot.sourceKey,
    sourceLabel: snapshot.sourceLabel,
    asOfDate: snapshot.asOfDate,
    periodStart: snapshot.periodStart,
    periodEnd: snapshot.periodEnd,
    enteredByName: snapshot.enteredByName,
    enteredAt: snapshot.enteredAt,
    note: snapshot.note,
  };
}

/** Read one metric's value from a snapshot, or null when it was left blank. */
export function valueOf(
  snapshot: OrganizationalSnapshot | null,
  metricKey: string
): number | null {
  if (!snapshot) return null;
  return snapshot.values.find((v) => v.metricKey === metricKey)?.value ?? null;
}
