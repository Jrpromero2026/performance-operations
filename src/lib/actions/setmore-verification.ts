"use server";

import { z } from "zod";
import {
  getActorContext,
  actorCan,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
} from "./shared";
import { classifyFailure } from "@/lib/integrations/shared/failures";
import { probeSetmore, type SetmoreVerificationReport } from "@/lib/sources/setmore/verify";

export interface VerificationState extends ActionState {
  report?: SetmoreVerificationReport;
}

/**
 * Verification asks for MORE authority than ordinary use, because it
 * bypasses the adapter's fail-closed gate to reach a live account. It
 * therefore requires the credential-management permission, not merely
 * `integration:sync`.
 */
const REQUIRED_PERMISSION = "integration:manage_credentials" as const;

const schema = z.object({
  connectionId: z.uuid(),
  startDate: z.iso.date("Enter a start date."),
  endDate: z.iso.date("Enter an end date."),
});

/** Setmore has no sandbox: every probe hits the live account. Keep it small. */
const MAX_WINDOW_DAYS = 31;

export async function runSetmoreVerification(
  _prev: VerificationState,
  formData: FormData
): Promise<VerificationState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const parsed = schema.safeParse({
    connectionId: formData.get("connectionId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { connectionId, startDate, endDate } = parsed.data;

  if (endDate < startDate) return { error: "The end date must be on or after the start date." };
  const spanDays =
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 + 1;
  if (spanDays > MAX_WINDOW_DAYS) {
    return {
      error: `Keep the verification window to ${MAX_WINDOW_DAYS} days or fewer — every request runs against the live Setmore account.`,
    };
  }

  const { data: connection } = await actor.supabase
    .from("integration_connections")
    .select("id, organization_id, provider_key, secret_ref")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection) return { error: "Connection not found." };
  if (connection.provider_key !== "setmore_api") {
    return { error: "This verification applies to Setmore connections only." };
  }
  if (!actorCan(actor, connection.organization_id, REQUIRED_PERMISSION)) {
    return PERMISSION_DENIED;
  }

  if (!process.env.WORKER_SECRET) {
    return {
      error:
        "The server key needed to resolve stored credentials is not configured in this environment.",
    };
  }
  if (!connection.secret_ref) {
    return { error: "No credential is stored for this connection yet." };
  }

  // Credential resolves SERVER-SIDE only and stays inside this call stack.
  const { data: secret } = await actor.supabase.rpc("get_connection_secret_with_key", {
    p_connection_id: connectionId,
    p_server_key: process.env.WORKER_SECRET,
  });
  if (typeof secret !== "string" || secret.trim() === "") {
    return { error: "The stored credential could not be resolved." };
  }

  let report: SetmoreVerificationReport;
  try {
    report = await probeSetmore({ refreshToken: secret, startDate, endDate });
  } catch (error) {
    const classified = classifyFailure(error);
    // Sanitized by classifyFailure — never echoes a credential.
    return { error: `${classified.operatorMessage} ${classified.recommendedAction}` };
  }

  await writeAudit(actor, {
    organizationId: connection.organization_id,
    entityType: "integration_connection",
    entityId: connectionId,
    action: "setmore_api_verification_probe",
    metadata: {
      window_start: startDate,
      window_end: endDate,
      appointment_count: report.appointmentCount,
      staff_count: report.staffCount,
      service_count: report.serviceCount,
      status_verdict: report.status.verdict,
      occurrence_verdict: report.occurrenceIdentity.verdict,
      cost_unit_recommendation: report.costUnit.recommendation,
    },
  });

  return {
    message: `Probe complete: ${report.appointmentCount} appointment(s), ${report.staffCount} staff, ${report.serviceCount} service(s).`,
    report,
  };
}
