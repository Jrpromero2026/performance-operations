/**
 * Job runner — claims and executes background jobs through the database
 * RPCs (atomic claim with lease, retry with backoff, dead-letter). Each
 * invocation performs BOUNDED work; one failing job never stops the
 * batch. Designed to be driven by the authenticated worker route in dev
 * and by a hosted scheduler (Supabase scheduled function / Vercel Cron)
 * in a future deployment — see docs/BACKGROUND_JOB_ARCHITECTURE.md.
 */

import type { ActorContext } from "@/lib/actions/shared";
import type { Json, Tables } from "@/lib/supabase/types";
import { runSync } from "../sync/engine";
import { deliverQueuedEmail, executeScheduledReport, occurrenceKey } from "../reports/execute";
import { classifyFailure } from "../shared/failures";
import { getProviderAdapter } from "../registry";

type BackgroundJob = Tables<"background_jobs">;

export interface WorkerSummary {
  workerId: string;
  claimed: number;
  succeeded: number;
  retryableFailed: number;
  permanentlyFailed: number;
  scheduledEnqueued: number;
  results: { jobId: string; jobType: string; outcome: string; detail: string }[];
}

/** Execute one claimed job; returns a short human-readable detail. */
async function executeJob(actor: ActorContext, job: BackgroundJob): Promise<string> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  switch (job.job_type) {
    case "appointment_sync":
    case "metadata_sync": {
      const result = await runSync(actor, {
        definitionId: String(payload.definition_id ?? ""),
        trigger: (payload.trigger as "manual" | "schedule" | "webhook" | "retry") ?? "schedule",
        jobId: job.id,
      });
      if (!result.ok) {
        const err = new Error(result.message);
        err.name = result.failureCode === "provider_blocked" ? "ProviderBlockedError" : err.name;
        throw Object.assign(err, { integrationCode: result.failureCode });
      }
      return result.message;
    }
    case "connection_validation": {
      const connectionId = String(payload.connection_id ?? "");
      const { data: connection } = await actor.supabase
        .from("integration_connections")
        .select("*")
        .eq("id", connectionId)
        .maybeSingle();
      if (!connection) throw new Error("connection_not_found");
      const adapter = getProviderAdapter(connection.provider_key);
      if (!adapter) throw new Error("unknown_provider");
      const validation = await adapter.validateConnection({
        connectionId,
        organizationId: connection.organization_id,
        window: { startDate: "1970-01-01", endDate: "1970-01-01" },
        cursor: null,
        secret: null,
        config: {},
        pageLimit: 1,
      });
      return validation.message;
    }
    case "scheduled_report_generation": {
      const result = await executeScheduledReport(actor, {
        definitionId: String(payload.definition_id ?? ""),
        intendedRunAt: String(payload.intended_run_at ?? ""),
        trigger: "schedule",
        jobId: job.id,
      });
      if (!result.ok && result.status !== "skipped") throw new Error(result.message);
      return result.message;
    }
    case "report_email_delivery":
    case "notification_email_delivery": {
      const result = await deliverQueuedEmail(
        actor,
        String(payload.delivery_idempotency_key ?? ""),
      );
      if (!result.ok && result.state !== "rejected") throw new Error(result.message);
      return `${result.state}: ${result.message}`;
    }
    case "webhook_processing": {
      // A webhook never mutates canonical data: it enqueues a sync for
      // the definition its connection points at.
      const definitionId = String(payload.definition_id ?? "");
      if (!definitionId) return "No sync definition linked to the webhook; nothing to do.";
      const result = await runSync(actor, {
        definitionId,
        trigger: "webhook",
        jobId: job.id,
      });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    }
    case "cleanup":
      // Retention policies are unresolved business decisions — cleanup
      // deliberately performs no destructive work in this phase.
      return "Cleanup is a no-op: retention policies are unresolved (DECISION_LOG U10*).";
    default:
      throw new Error(`unknown_job_type:${job.job_type}`);
  }
}

/**
 * Enqueue jobs for scheduled-report definitions that are DUE: execution
 * enabled, active, and the current occurrence (per frequency) not yet
 * executed. Occurrence identity is minute-normalized so repeated ticks
 * enqueue idempotently.
 */
export async function enqueueDueSchedules(actor: ActorContext): Promise<number> {
  const { data: definitions } = await actor.supabase
    .from("scheduled_report_definitions")
    .select("id, organization_id, frequency, active, execution_enabled")
    .eq("active", true)
    .eq("execution_enabled", true);
  let enqueued = 0;
  const now = new Date();
  for (const definition of definitions ?? []) {
    const occurrence = currentOccurrence(definition.frequency, now);
    if (!occurrence) continue; // period_close/custom: no wall-clock occurrence
    const { data: existing } = await actor.supabase
      .from("scheduled_report_runs")
      .select("id")
      .eq("definition_id", definition.id)
      .eq("intended_run_at", occurrence)
      .limit(1);
    if ((existing ?? []).length > 0) continue;
    const { error } = await actor.supabase.rpc("enqueue_background_job", {
      p_organization_id: definition.organization_id,
      p_job_type: "scheduled_report_generation",
      p_payload: {
        definition_id: definition.id,
        intended_run_at: occurrence,
      } as unknown as Json,
      p_idempotency_key: `schedule:${definition.id}:${occurrence}`,
    });
    if (!error) enqueued += 1;
  }
  return enqueued;
}

/** The wall-clock occurrence a frequency is currently due for (UTC). */
export function currentOccurrence(frequency: string, now: Date): string | null {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  switch (frequency) {
    case "daily": {
      d.setUTCHours(0);
      return occurrenceKey(d);
    }
    case "weekly": {
      d.setUTCHours(0);
      d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // week starts Sunday UTC
      return occurrenceKey(d);
    }
    case "monthly": {
      d.setUTCHours(0);
      d.setUTCDate(1);
      return occurrenceKey(d);
    }
    default:
      return null;
  }
}

/** One bounded worker pass: scheduler tick + claim + execute. */
export async function runWorkerBatch(
  actor: ActorContext,
  workerId: string,
  limit = 5,
): Promise<WorkerSummary> {
  const summary: WorkerSummary = {
    workerId,
    claimed: 0,
    succeeded: 0,
    retryableFailed: 0,
    permanentlyFailed: 0,
    scheduledEnqueued: 0,
    results: [],
  };

  summary.scheduledEnqueued = await enqueueDueSchedules(actor);

  const { data: jobs, error: claimError } = await actor.supabase.rpc(
    "claim_background_jobs",
    { p_worker_id: workerId, p_limit: limit, p_lease_seconds: 300 },
  );
  if (claimError) {
    summary.results.push({
      jobId: "-",
      jobType: "-",
      outcome: "claim_failed",
      detail: claimError.message,
    });
    return summary;
  }

  for (const job of (jobs ?? []) as BackgroundJob[]) {
    summary.claimed += 1;
    try {
      await actor.supabase.rpc("start_background_job", {
        p_job_id: job.id,
        p_worker_id: workerId,
      });
      const detail = await executeJob(actor, job);
      await actor.supabase.rpc("complete_background_job", {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_result: { detail } as unknown as Json,
      });
      summary.succeeded += 1;
      summary.results.push({ jobId: job.id, jobType: job.job_type, outcome: "succeeded", detail });
    } catch (error) {
      const classified = classifyFailure(error);
      const { data: status } = await actor.supabase.rpc("fail_background_job", {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_error_code: classified.code,
        p_error: classified.operatorMessage,
        p_retryable: classified.retryable,
      });
      if (status === "retryable_failed") summary.retryableFailed += 1;
      else summary.permanentlyFailed += 1;
      summary.results.push({
        jobId: job.id,
        jobType: job.job_type,
        outcome: String(status ?? "failed"),
        detail: classified.operatorMessage,
      });
    }
  }
  return summary;
}
