import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WorkspaceContext } from "@/lib/workspace/server";

export const PERIOD_COOKIE = "po-period";

export interface PeriodOption {
  id: string;
  label: string;
  periodType: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface PeriodContext {
  /** Periods selectable in the current workspace (org-scoped). */
  options: PeriodOption[];
  /** The validated selection; null when none selected or not applicable. */
  selected: PeriodOption | null;
  /**
   * All Workspaces mode: organization-specific periods are never treated as
   * globally valid, so selection is disabled entirely.
   */
  selectable: boolean;
}

/**
 * Resolve the reporting-period context for the current request. The cookie
 * is only a *request*: the stored id must belong to a period of the
 * currently selected organization, or it is ignored (stale/forged cookies
 * fall back to no selection).
 */
export async function getPeriodContext(
  workspace: WorkspaceContext
): Promise<PeriodContext> {
  if (workspace.mode !== "live" || workspace.selection.kind !== "organization") {
    return { options: [], selected: null, selectable: false };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { options: [], selected: null, selectable: false };

  const { data } = await supabase
    .from("reporting_periods")
    .select("id, label, period_type, start_date, end_date, status")
    .eq("organization_id", workspace.selection.organizationId)
    .order("start_date", { ascending: false })
    .limit(36);

  const options: PeriodOption[] = (data ?? []).map((p) => ({
    id: p.id,
    label: p.label,
    periodType: p.period_type,
    startDate: p.start_date,
    endDate: p.end_date,
    status: p.status,
  }));

  const cookieStore = await cookies();
  const requested = cookieStore.get(PERIOD_COOKIE)?.value ?? null;
  const selected = options.find((p) => p.id === requested) ?? null;

  return { options, selected, selectable: true };
}
