import { NextResponse } from "next/server";
import { getActorContext } from "@/lib/actions/shared";
import { runWorkerBatch } from "@/lib/integrations/jobs/runner";

/**
 * Worker invocation endpoint — DEVELOPMENT execution surface for the
 * background-job system. NOT a public endpoint:
 *
 *  - the caller must present the server-held WORKER_SECRET header AND
 *  - hold an authenticated platform-admin session (the job RPCs
 *    re-verify authority in the database).
 *
 * Each invocation performs bounded work (scheduler tick + up to
 * `limit` claimed jobs) and returns an execution summary. Production
 * scheduling (Supabase scheduled Edge Function or Vercel Cron with the
 * service role) is documented but NOT enabled in this phase — see
 * docs/BACKGROUND_JOB_ARCHITECTURE.md.
 */
export async function POST(request: Request) {
  const configured = process.env.WORKER_SECRET;
  if (!configured) {
    return NextResponse.json({ error: "worker_not_configured" }, { status: 503 });
  }
  const presented = request.headers.get("x-worker-secret");
  if (presented !== configured) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const actor = await getActorContext();
  if (!actor) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let limit = 5;
  let workerId = `worker-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const body = (await request.json()) as { limit?: number; worker_id?: string };
    if (Number.isInteger(body.limit) && body.limit! >= 1 && body.limit! <= 20) {
      limit = body.limit!;
    }
    if (typeof body.worker_id === "string" && body.worker_id.length >= 3) {
      workerId = body.worker_id.slice(0, 60);
    }
  } catch {
    // empty body is fine — defaults apply
  }

  const summary = await runWorkerBatch(actor, workerId, limit);
  return NextResponse.json(summary);
}
