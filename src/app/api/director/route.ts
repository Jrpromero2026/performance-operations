/**
 * POST /api/director — one Director turn.
 *
 * Auth model:
 *  - Signed-in user only; the org id from the body is VALIDATED against
 *    server-loaded memberships (never trusted).
 *  - Tools run through the caller's own RLS client, so the reply can
 *    never contain data the caller could not read directly.
 *  - Conversation ownership is the (organization, profile) triple,
 *    enforced by RLS on every read and write — a stolen conversation id
 *    is useless to anyone but its owner.
 *  - Rate limit: a per-user hourly cap on runs, counted server-side.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import {
  isDirectorConfigured,
  runDirectorTurn,
  directorModel,
} from "@/lib/director/service";

export const runtime = "nodejs";
export const maxDuration = 120;

const RUNS_PER_HOUR = 30;
const MAX_QUESTION_CHARS = 2_000;
const HISTORY_MESSAGES = 12;

const bodySchema = z.object({
  organizationId: z.uuid(),
  conversationId: z.uuid().nullish(),
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
});

export async function POST(request: Request): Promise<Response> {
  const actor = await getActorContext();
  if (!actor) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { organizationId, conversationId, question } = parsed.data;

  // Org membership is the gate; org:read is the minimum any member holds.
  if (!hasPermissionInOrganization(actor.memberships, organizationId, "org:read")) {
    return NextResponse.json(
      { error: "You do not have access to this organization." },
      { status: 403 }
    );
  }

  if (!isDirectorConfigured()) {
    return NextResponse.json(
      {
        error:
          "The Director is not configured in this environment (no model API key).",
      },
      { status: 503 }
    );
  }

  // Rate limit before any model spend.
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count: recentRuns } = await actor.supabase
    .from("director_runs")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", actor.userId)
    .gte("created_at", hourAgo);
  if ((recentRuns ?? 0) >= RUNS_PER_HOUR) {
    return NextResponse.json(
      { error: "Rate limit reached — try again in a little while." },
      { status: 429 }
    );
  }

  // Resolve or create the conversation. RLS pins both paths to the owner.
  let convId = conversationId ?? null;
  if (convId) {
    const { data: conv } = await actor.supabase
      .from("director_conversations")
      .select("id, organization_id")
      .eq("id", convId)
      .maybeSingle();
    if (!conv || conv.organization_id !== organizationId) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
  } else {
    const { data: created, error } = await actor.supabase
      .from("director_conversations")
      .insert({
        organization_id: organizationId,
        profile_id: actor.userId,
        title: question.slice(0, 80),
      })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json(
        { error: "Could not start the conversation." },
        { status: 500 }
      );
    }
    convId = created.id;
  }

  // Prior turns (user/assistant only — tool evidence stays server-side).
  const { data: prior } = await actor.supabase
    .from("director_messages")
    .select("role, content")
    .eq("conversation_id", convId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(HISTORY_MESSAGES);

  const { data: run } = await actor.supabase
    .from("director_runs")
    .insert({
      conversation_id: convId,
      organization_id: organizationId,
      profile_id: actor.userId,
      model: directorModel(),
    })
    .select("id")
    .single();

  const startedAt = Date.now();
  try {
    const reply = await runDirectorTurn({
      toolContext: {
        actor,
        organizationId,
        todayIsoDate: new Date().toISOString().slice(0, 10),
      },
      history: (prior ?? []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      question,
    });

    await actor.supabase.from("director_messages").insert([
      {
        conversation_id: convId,
        organization_id: organizationId,
        profile_id: actor.userId,
        role: "user",
        content: question,
      },
      {
        conversation_id: convId,
        organization_id: organizationId,
        profile_id: actor.userId,
        role: "assistant",
        content: reply.content,
        tool_payload: { tool_calls: reply.toolCalls } as never,
      },
    ]);
    if (run) {
      await actor.supabase
        .from("director_runs")
        .update({
          status: "succeeded",
          tool_calls: reply.toolCalls.length,
          input_tokens: reply.inputTokens,
          output_tokens: reply.outputTokens,
          duration_ms: Date.now() - startedAt,
        })
        .eq("id", run.id);
    }

    return NextResponse.json({
      conversationId: convId,
      answer: reply.content,
      toolCalls: reply.toolCalls.map((t) => t.name),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "director_failed";
    if (run) {
      await actor.supabase
        .from("director_runs")
        .update({
          status: "failed",
          error: code.slice(0, 200),
          duration_ms: Date.now() - startedAt,
        })
        .eq("id", run.id);
    }
    const friendly =
      code === "director_model_timeout"
        ? "The model took too long — try again."
        : code.startsWith("director_model_error_401")
          ? "The model API key was rejected — check the OPENAI_API_KEY configuration."
          : "The Director hit an error — try again.";
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}
