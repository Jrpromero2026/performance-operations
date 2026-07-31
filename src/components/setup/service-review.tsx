"use client";

import { useActionState, useMemo, useState } from "react";
import { bulkCreateServices } from "@/lib/actions/setup";
import type { AliasCluster, DiscoveredService } from "@/lib/imports/discovery";
import type { ActionState } from "@/lib/actions/shared";

/**
 * Setup step 4 — review the services found in the schedule.
 *
 * Alias merging happens here, inline, rather than on a separate
 * configuration screen. That was the actual UX failure the audit found:
 * `PT`, `Personal Training`, and `Personal Training 60` are one service
 * to an owner and four rows to the database, and the owner should group
 * them at the moment they are discovered.
 *
 * Suggested clusters come from the discovery engine, which groups only
 * duration and filler variants. Abbreviations are never auto-grouped —
 * the owner merges those by selecting rows and choosing a canonical
 * name.
 */

interface Group {
  /** Stable key: the canonical source name. */
  key: string;
  canonical: string;
  members: string[];
  appointmentCount: number;
}

export function ServiceReview({
  organizationId,
  discovered,
  clusters,
  continueHref,
}: {
  organizationId: string;
  discovered: DiscoveredService[];
  clusters: AliasCluster[];
  continueHref: string;
}) {
  const linked = discovered.filter((s) => s.existingId !== null);
  const creatable = useMemo(
    () => discovered.filter((s) => s.existingId === null),
    [discovered]
  );

  // Seed groups from the discovery engine's conservative clusters.
  const [groups, setGroups] = useState<Group[]>(() => {
    const counts = new Map(creatable.map((s) => [s.sourceName, s.appointmentCount]));
    const claimed = new Set<string>();
    const seeded: Group[] = [];

    for (const cluster of clusters) {
      const members = cluster.members.filter((m) => counts.has(m));
      if (members.length < 2) continue;
      members.forEach((m) => claimed.add(m));
      seeded.push({
        key: cluster.suggestedCanonical,
        canonical: cluster.suggestedCanonical,
        members,
        appointmentCount: members.reduce((sum, m) => sum + (counts.get(m) ?? 0), 0),
      });
    }
    for (const service of creatable) {
      if (claimed.has(service.sourceName)) continue;
      seeded.push({
        key: service.sourceName,
        canonical: service.sourceName,
        members: [service.sourceName],
        appointmentCount: service.appointmentCount,
      });
    }
    return seeded.sort((a, b) => b.appointmentCount - a.appointmentCount);
  });

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(groups.map((g) => g.key))
  );
  const [merging, setMerging] = useState<Set<string>>(new Set());

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    bulkCreateServices,
    {}
  );

  const chosen = groups.filter((g) => selected.has(g.key));

  const payload = JSON.stringify({
    organizationId,
    services: chosen.map((group) => ({
      sourceName: group.members[0],
      displayName: group.canonical.trim(),
      aliases: group.members,
    })),
  });

  function toggle(key: string, set: Set<string>, setter: (s: Set<string>) => void): void {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  /** Fold every checked merge candidate into one service. */
  function mergeSelected(): void {
    if (merging.size < 2) return;
    setGroups((prev) => {
      const involved = prev.filter((g) => merging.has(g.key));
      const rest = prev.filter((g) => !merging.has(g.key));
      const members = [...new Set(involved.flatMap((g) => g.members))].sort();
      // Longest name is the most descriptive; the owner can edit it.
      const canonical = [...members].sort((a, b) => b.length - a.length)[0];
      const merged: Group = {
        key: canonical,
        canonical,
        members,
        appointmentCount: involved.reduce((sum, g) => sum + g.appointmentCount, 0),
      };
      return [...rest, merged].sort((a, b) => b.appointmentCount - a.appointmentCount);
    });
    setSelected((prev) => {
      const next = new Set([...prev].filter((k) => !merging.has(k)));
      const members = groups.filter((g) => merging.has(g.key)).flatMap((g) => g.members);
      const canonical = [...new Set(members)].sort((a, b) => b.length - a.length)[0];
      next.add(canonical);
      return next;
    });
    setMerging(new Set());
  }

  const inputClass =
    "h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink";

  return (
    <div className="space-y-6">
      {state.message && (
        <p role="status" className="rounded-[--radius-control] bg-positive-soft px-3 py-2 text-sm text-positive">
          {state.message}
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-[--radius-control] bg-negative-soft px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}

      {linked.length > 0 && (
        <section aria-label="Already set up">
          <h2 className="mb-2 text-sm font-medium text-ink-secondary">
            Already set up ({linked.length})
          </h2>
          <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface">
            {linked.map((service) => (
              <li key={service.sourceName} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-ink">{service.sourceName}</span>
                <span className="text-sm text-ink-muted">
                  {service.appointmentCount} appointments &middot; matched
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.length === 0 ? (
        <p className="rounded-[--radius-card] border border-border bg-surface px-4 py-6 text-center text-sm text-ink-muted">
          Every service in your schedule is already set up.
        </p>
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="payload" value={payload} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-ink-secondary">
              New services found ({groups.length})
            </h2>
            <div className="flex items-center gap-3">
              {merging.size >= 2 && (
                <button
                  type="button"
                  onClick={mergeSelected}
                  data-testid="service-merge"
                  className="h-9 rounded-[--radius-control] border border-accent px-3 text-sm font-medium text-accent hover:bg-accent-soft"
                >
                  Merge {merging.size} into one service
                </button>
              )}
              <button
                type="button"
                data-testid="service-select-all"
                onClick={() =>
                  setSelected(
                    selected.size === groups.length ? new Set() : new Set(groups.map((g) => g.key))
                  )
                }
                className="text-sm text-accent hover:underline"
              >
                {selected.size === groups.length ? "Clear all" : "Select all"}
              </button>
            </div>
          </div>

          <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface">
            {groups.map((group) => (
              <li
                key={group.key}
                data-testid="service-row"
                data-canonical={group.canonical}
                className="px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(group.key)}
                    onChange={() => toggle(group.key, selected, setSelected)}
                    aria-label={`Create ${group.canonical}`}
                    className="mt-2 h-4 w-4 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <input
                        value={group.canonical}
                        onChange={(e) =>
                          setGroups((prev) =>
                            prev.map((g) =>
                              g.key === group.key ? { ...g, canonical: e.target.value } : g
                            )
                          )
                        }
                        aria-label={`Name for ${group.key}`}
                        className={`${inputClass} max-w-sm font-medium`}
                      />
                      <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                        {group.appointmentCount} appointments
                      </span>
                    </div>
                    {group.members.length > 1 && (
                      <p className="mt-1.5 text-xs text-ink-muted">
                        Your schedule writes this {group.members.length} ways:{" "}
                        {group.members.join(" · ")}. All of them will match this
                        service.
                      </p>
                    )}
                    <label className="mt-2 inline-flex items-center gap-2 text-xs text-ink-muted">
                      <input
                        type="checkbox"
                        checked={merging.has(group.key)}
                        onChange={() => toggle(group.key, merging, setMerging)}
                        className="h-3.5 w-3.5"
                      />
                      Same as another service
                    </label>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending || chosen.length === 0}
              data-testid="service-create-selected"
              className="h-10 rounded-[--radius-control] bg-accent px-4 text-sm font-medium text-surface shadow-sm hover:bg-accent-strong disabled:opacity-60"
            >
              {pending
                ? "Creating…"
                : `Create ${chosen.length} service${chosen.length === 1 ? "" : "s"}`}
            </button>
            <a href={continueHref} className="text-sm text-accent hover:underline">
              Skip for now
            </a>
          </div>
        </form>
      )}

      {state.message && (
        <a
          href={continueHref}
          data-testid="setup-continue"
          className="inline-flex h-10 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-medium text-surface shadow-sm hover:bg-accent-strong"
        >
          Continue: configure compensation
        </a>
      )}
    </div>
  );
}
