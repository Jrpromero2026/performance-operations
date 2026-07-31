import { planPeriods } from "@/lib/dates/period-plan";
import type { PeriodType } from "@/lib/dates/period-plan";
import { writeAudit, type ActorContext } from "@/lib/actions/shared";

/**
 * Organization-setup helpers. These live outside the `"use server"`
 * module because a server-action file may only export async functions
 * callable from the client — `slugify` is pure, and
 * `ensurePeriodsCovering` takes a server-only ActorContext that must
 * never be reachable as an action endpoint.
 */

const SLUG_MAX = 60;

/** Name → URL-safe slug matching the organizations slug constraint. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return base.length > 0 ? base : "organization";
}

/** First slug of the form base, base-2, base-3… not already taken. */
export async function availableSlug(
  actor: ActorContext,
  base: string
): Promise<string> {
  const { data } = await actor.supabase
    .from("organizations")
    .select("slug")
    .like("slug", `${base}%`);
  const taken = new Set((data ?? []).map((row) => row.slug));
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}`.slice(0, SLUG_MAX);
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`.slice(0, SLUG_MAX);
}

/**
 * Generate any periods still needed to cover a date span — used after
 * the schedule upload reveals which dates the data actually covers.
 * Existing periods are left untouched; overlaps are skipped rather than
 * forced, because `reporting_periods` refuses overlapping periods of the
 * same type and that constraint is the authority.
 */
export async function ensurePeriodsCovering(
  actor: ActorContext,
  organizationId: string,
  from: string,
  to: string,
  periodType: PeriodType
): Promise<{ created: number; skipped: number }> {
  const planned = planPeriods(from, to, periodType);
  if (planned.length === 0) return { created: 0, skipped: 0 };

  const { data: existing } = await actor.supabase
    .from("reporting_periods")
    .select("start_date, end_date, period_type")
    .eq("organization_id", organizationId)
    .eq("period_type", periodType);

  const current = existing ?? [];
  let created = 0;
  let skipped = 0;

  for (const period of planned) {
    const overlaps = current.some(
      (row) => row.start_date <= period.endDate && period.startDate <= row.end_date
    );
    if (overlaps) {
      skipped += 1;
      continue;
    }
    const { error } = await actor.supabase.from("reporting_periods").insert({
      organization_id: organizationId,
      label: period.label,
      period_type: period.periodType,
      start_date: period.startDate,
      end_date: period.endDate,
      payment_date: null,
      notes: "",
      status: "open",
    });
    if (error) {
      skipped += 1;
      continue;
    }
    current.push({
      start_date: period.startDate,
      end_date: period.endDate,
      period_type: period.periodType,
    });
    created += 1;
  }

  if (created > 0) {
    await writeAudit(actor, {
      organizationId,
      entityType: "reporting_period",
      action: "periods_generated_from_schedule",
      metadata: { from, to, period_type: periodType, created, skipped },
    });
  }

  return { created, skipped };
}
