import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getActorContext } from "@/lib/actions/shared";
import { getProviderAdapter } from "@/lib/integrations/registry";
import type { Json } from "@/lib/supabase/types";

/**
 * Provider webhook ingestion — provider-neutral, fail-closed:
 *
 *  - the URL token is the endpoint credential (only its sha256 is
 *    stored, invitation pattern) — no generic unauthenticated endpoint;
 *  - payload size + content type limits;
 *  - provider-specific signature verification through the adapter;
 *  - event-ID idempotency (DB unique) with duplicate short-circuit;
 *  - fast acknowledgement: processing happens asynchronously via an
 *    enqueued background job — a webhook NEVER updates canonical data.
 *
 * Note (dev limitation): signature secrets resolve through the
 * server-held worker key; endpoints without a resolvable secret reject.
 */

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (
    !contentType.includes("application/json") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return NextResponse.json({ error: "unsupported_content_type" }, { status: 415 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  // Webhook ingestion uses the server session context (RLS-scoped); the
  // endpoint lookup itself is by token hash.
  const actor = await getActorContext();
  if (!actor) {
    // No ambient session in this environment: webhooks are processed in
    // dev through the authenticated test flow only.
    return NextResponse.json({ error: "ingestion_unavailable" }, { status: 503 });
  }

  const tokenSha = createHash("sha256").update(token, "utf8").digest("hex");
  const { data: endpoint } = await actor.supabase
    .from("integration_webhook_endpoints")
    .select("*")
    .eq("token_sha256", tokenSha)
    .eq("active", true)
    .maybeSingle();
  if (!endpoint) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const adapter = getProviderAdapter(endpoint.provider_key);
  if (!adapter?.verifyWebhook || !adapter.parseWebhook) {
    return NextResponse.json({ error: "webhooks_unsupported" }, { status: 400 });
  }

  // Resolve the connection's secret server-side for signature checking.
  const workerKey = process.env.WORKER_SECRET;
  let secret: string | null = null;
  if (workerKey) {
    const { data } = await actor.supabase.rpc("get_connection_secret_with_key", {
      p_connection_id: endpoint.connection_id,
      p_server_key: workerKey,
    });
    secret = (data as string | null) ?? null;
  }

  const verification = adapter.verifyWebhook({
    rawBody,
    signatureHeader: request.headers.get("x-signature"),
    timestampHeader: request.headers.get("x-timestamp"),
    secret,
  });
  if (!verification.valid) {
    return NextResponse.json(
      { error: "signature_invalid", reason: verification.reason },
      { status: 401 },
    );
  }

  const parsed = adapter.parseWebhook(rawBody, contentType);
  if (!parsed) {
    return NextResponse.json({ error: "unparseable_event" }, { status: 400 });
  }

  const payloadSha = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const { data: event, error: insertError } = await actor.supabase
    .from("integration_webhook_events")
    .insert({
      endpoint_id: endpoint.id,
      connection_id: endpoint.connection_id,
      organization_id: endpoint.organization_id,
      provider_event_id: parsed.providerEventId,
      event_type: parsed.eventType,
      payload: parsed.payload as Json,
      payload_sha256: payloadSha,
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      // Same provider event delivered twice — idempotent acknowledge.
      return NextResponse.json({ status: "duplicate" }, { status: 200 });
    }
    return NextResponse.json({ error: "ingestion_failed" }, { status: 500 });
  }

  // Enqueue asynchronous processing: sync via the connection's first
  // active appointments definition (webhooks are thin notifications).
  const { data: definition } = await actor.supabase
    .from("integration_sync_definitions")
    .select("id")
    .eq("connection_id", endpoint.connection_id)
    .eq("data_type", "appointments")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const { data: jobId } = await actor.supabase.rpc("enqueue_background_job", {
    p_organization_id: endpoint.organization_id,
    p_job_type: "webhook_processing",
    p_payload: {
      webhook_event_id: event.id,
      definition_id: definition?.id ?? null,
    } as unknown as Json,
    p_idempotency_key: `webhook:${endpoint.id}:${parsed.providerEventId}`,
  });
  await actor.supabase
    .from("integration_webhook_events")
    .update({ status: "enqueued", job_id: (jobId as string | null) ?? null })
    .eq("id", event.id);

  return NextResponse.json({ status: "accepted" }, { status: 202 });
}
