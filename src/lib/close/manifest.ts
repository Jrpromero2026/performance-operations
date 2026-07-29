/**
 * Close manifest — deterministic construction and hashing. The manifest
 * stores REFERENCES and hashes (never full operational datasets, never
 * client PII). Determinism: object keys are serialized sorted, arrays in
 * the order the builder emits (itself sorted), so identical inputs always
 * produce byte-identical JSON and the same sha256.
 */

import { createHash } from "node:crypto";
import type { CloseCheck } from "./checks";

/** JSON.stringify with recursively sorted object keys (deterministic). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(",")}}`;
}

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export interface ManifestExportRef {
  id: string;
  export_type: string;
  file_name: string;
  version: number;
  sha256: string;
  row_count: number;
}

export interface ManifestInput {
  organizationId: string;
  organizationName: string;
  period: { id: string; label: string; startDate: string; endDate: string };
  closeRunId: string;
  closeVersion: number;
  sourceCutoffAt: string | null;
  approvals: {
    initiatedBy: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
  };
  acknowledgements: { checkCode: string; actorId: string | null; note: string; at: string }[];
  intelligenceVersion: string;
  payroll: {
    runId: string;
    calculationVersion: string;
    snapshotVersion: number | null;
    snapshotSha256: string | null;
  } | null;
  appointmentCount: number;
  importBatches: { included: string[]; reversed: string[] };
  reportPackage: { id: string; type: string; version: number; sha256: string | null };
  exports: ManifestExportRef[];
  trainerStatementVersions: { trainerId: string; sha256: string }[] | null;
  readinessChecks: CloseCheck[];
  supersedesCloseRunId: string | null;
  reopenHistory: { closeVersion: number; reopenedAt: string | null; reason: string | null }[];
}

/**
 * Build the manifest payload. Volatile fields (closed_by/closed_at) are
 * recorded on the close run and manifest ROW, not inside the hashed
 * payload, so the hash is reproducible from frozen sources.
 */
export function buildManifestPayload(input: ManifestInput): Record<string, unknown> {
  return {
    manifest_kind: "period_close",
    manifest_schema_version: 1,
    organization_id: input.organizationId,
    organization_name: input.organizationName,
    reporting_period: {
      id: input.period.id,
      label: input.period.label,
      start_date: input.period.startDate,
      end_date: input.period.endDate,
    },
    close_run_id: input.closeRunId,
    close_version: input.closeVersion,
    source_cutoff_at: input.sourceCutoffAt,
    approvals: {
      initiated_by: input.approvals.initiatedBy,
      reviewed_by: input.approvals.reviewedBy,
      reviewed_at: input.approvals.reviewedAt,
      approved_by: input.approvals.approvedBy,
      approved_at: input.approvals.approvedAt,
    },
    warning_acknowledgements: [...input.acknowledgements]
      .sort((a, b) => a.checkCode.localeCompare(b.checkCode))
      .map((a) => ({
        check_code: a.checkCode,
        actor_id: a.actorId,
        note: a.note,
        acknowledged_at: a.at,
      })),
    engine_versions: {
      intelligence: input.intelligenceVersion,
      payroll_calculation: input.payroll?.calculationVersion ?? null,
    },
    payroll: input.payroll
      ? {
          run_id: input.payroll.runId,
          snapshot_version: input.payroll.snapshotVersion,
          snapshot_sha256: input.payroll.snapshotSha256,
        }
      : null,
    appointment_count: input.appointmentCount,
    import_batches: {
      included: [...input.importBatches.included].sort(),
      reversed: [...input.importBatches.reversed].sort(),
    },
    report_package_id: input.reportPackage.id,
    report_package: {
      id: input.reportPackage.id,
      type: input.reportPackage.type,
      version: input.reportPackage.version,
      sha256: input.reportPackage.sha256,
    },
    exports: [...input.exports]
      .sort((a, b) => a.export_type.localeCompare(b.export_type) || a.version - b.version)
      .map((e) => ({
        id: e.id,
        export_type: e.export_type,
        file_name: e.file_name,
        version: e.version,
        sha256: e.sha256,
        row_count: e.row_count,
      })),
    trainer_statements: input.trainerStatementVersions
      ? [...input.trainerStatementVersions]
          .sort((a, b) => a.trainerId.localeCompare(b.trainerId))
          .map((s) => ({ trainer_id: s.trainerId, sha256: s.sha256 }))
      : null,
    readiness_results: [...input.readinessChecks]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((c) => ({
        code: c.code,
        category: c.category,
        severity: c.severity,
        status: c.status,
        resolution_state: c.resolutionState,
        explanation: c.explanation,
      })),
    supersedes_close_run_id: input.supersedesCloseRunId,
    reopen_history: input.reopenHistory.map((h) => ({
      close_version: h.closeVersion,
      reopened_at: h.reopenedAt,
      reason: h.reason,
    })),
  };
}

export function hashManifest(payload: Record<string, unknown>): string {
  return sha256Hex(stableStringify(payload));
}
