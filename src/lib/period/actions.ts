"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PERIOD_COOKIE } from "./server";

/**
 * Switch the active reporting period. Server-validated: the requested period
 * must exist AND belong to the currently selected organization; anything
 * else clears the selection. Never available in All Workspaces mode.
 */
export async function switchPeriod(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const raw = formData.get("period");

  if (raw === "" || raw === null) {
    cookieStore.delete(PERIOD_COOKIE);
    revalidatePath("/", "layout");
    return;
  }

  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) return;

  const workspace = await getWorkspaceContext();
  if (workspace.mode !== "live" || workspace.selection.kind !== "organization") {
    cookieStore.delete(PERIOD_COOKIE);
    return;
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  const { data: period } = await supabase
    .from("reporting_periods")
    .select("id")
    .eq("id", parsed.data)
    .eq("organization_id", workspace.selection.organizationId)
    .maybeSingle();
  if (!period) {
    cookieStore.delete(PERIOD_COOKIE);
    revalidatePath("/", "layout");
    return;
  }

  cookieStore.set(PERIOD_COOKIE, period.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 90,
  });
  revalidatePath("/", "layout");
}
