"use client";

import { useActionState, useMemo, useState } from "react";
import { bulkCreateTrainers } from "@/lib/actions/setup";
import { splitTrainerName } from "@/lib/imports/trainer-names";
import type { DiscoveredTrainer } from "@/lib/imports/discovery";
import type { ActionState } from "@/lib/actions/shared";

/**
 * Setup step 3 — review the trainers found in the schedule.
 *
 * Replaces one navigation per trainer with one selection pass. Trainers
 * already linked to a record are shown but not selectable; there is
 * nothing to create.
 *
 * A source name with only one token cannot yield a surname, and the
 * trainer record requires one. Rather than fabricate it, those rows ask
 * for it inline and stay out of the selection until answered.
 */

interface Row {
  sourceName: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  appointmentCount: number;
  needsLastName: boolean;
}

export function TrainerReview({
  organizationId,
  discovered,
  continueHref,
}: {
  organizationId: string;
  discovered: DiscoveredTrainer[];
  continueHref: string;
}) {
  const linked = discovered.filter((t) => t.existingId !== null);
  const creatable = discovered.filter((t) => t.existingId === null);

  const [rows, setRows] = useState<Row[]>(() =>
    creatable.map((trainer) => {
      const split = splitTrainerName(trainer.sourceName);
      return {
        sourceName: trainer.sourceName,
        firstName: split.firstName,
        lastName: split.lastName,
        displayName: split.displayName,
        email: trainer.emails[0] ?? "",
        appointmentCount: trainer.appointmentCount,
        needsLastName: split.needsLastName,
      };
    })
  );

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(creatable.filter((t) => !splitTrainerName(t.sourceName).needsLastName).map((t) => t.sourceName))
  );

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    bulkCreateTrainers,
    {}
  );

  const ready = useMemo(
    () => rows.filter((row) => selected.has(row.sourceName) && row.lastName.trim().length > 0),
    [rows, selected]
  );

  const payload = JSON.stringify({
    organizationId,
    trainers: ready.map((row) => ({
      sourceName: row.sourceName,
      firstName: row.firstName.trim(),
      lastName: row.lastName.trim(),
      displayName: row.displayName,
      email: row.email.trim(),
    })),
  });

  function toggle(sourceName: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sourceName)) next.delete(sourceName);
      else next.add(sourceName);
      return next;
    });
  }

  function updateRow(sourceName: string, patch: Partial<Row>): void {
    setRows((prev) =>
      prev.map((row) => (row.sourceName === sourceName ? { ...row, ...patch } : row))
    );
  }

  const allSelected = selected.size === rows.length && rows.length > 0;
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
        <section aria-label="Already in your roster">
          <h2 className="mb-2 text-sm font-medium text-ink-secondary">
            Already in your roster ({linked.length})
          </h2>
          <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface">
            {linked.map((trainer) => (
              <li key={trainer.sourceName} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-ink">{trainer.sourceName}</span>
                <span className="text-sm text-ink-muted">
                  {trainer.appointmentCount} appointments &middot; matched
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <p className="rounded-[--radius-card] border border-border bg-surface px-4 py-6 text-center text-sm text-ink-muted">
          Every trainer in your schedule is already in your roster.
        </p>
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="payload" value={payload} />

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-secondary">
              New trainers found ({rows.length})
            </h2>
            <button
              type="button"
              data-testid="trainer-select-all"
              onClick={() =>
                setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.sourceName)))
              }
              className="text-sm text-accent hover:underline"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>

          <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface">
            {rows.map((row) => {
              const isSelected = selected.has(row.sourceName);
              const blocked = isSelected && row.lastName.trim().length === 0;
              return (
                <li
                  key={row.sourceName}
                  data-testid="trainer-row"
                  data-source-name={row.sourceName}
                  className="px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(row.sourceName)}
                      aria-label={`Create ${row.displayName}`}
                      className="mt-2 h-4 w-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium text-ink">
                          {row.displayName}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                          {row.appointmentCount} appointments
                        </span>
                      </div>
                      {isSelected && (
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <label className="block">
                            <span className="sr-only">First name</span>
                            <input
                              value={row.firstName}
                              onChange={(e) => updateRow(row.sourceName, { firstName: e.target.value })}
                              placeholder="First name"
                              className={inputClass}
                            />
                          </label>
                          <label className="block">
                            <span className="sr-only">Last name</span>
                            <input
                              value={row.lastName}
                              onChange={(e) => updateRow(row.sourceName, { lastName: e.target.value })}
                              placeholder="Last name"
                              data-testid="trainer-last-name"
                              className={`${inputClass} ${blocked ? "border-warning" : ""}`}
                            />
                          </label>
                          <label className="block">
                            <span className="sr-only">Email</span>
                            <input
                              value={row.email}
                              onChange={(e) => updateRow(row.sourceName, { email: e.target.value })}
                              placeholder="Email (optional)"
                              className={inputClass}
                            />
                          </label>
                        </div>
                      )}
                      {blocked && (
                        <p className="mt-1.5 text-xs text-warning">
                          Your schedule lists this person by one name only. Add a
                          last name — we won&rsquo;t invent one, because it would
                          appear on payroll statements.
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending || ready.length === 0}
              data-testid="trainer-create-selected"
              className="h-10 rounded-[--radius-control] bg-accent px-4 text-sm font-medium text-surface shadow-sm hover:bg-accent-strong disabled:opacity-60"
            >
              {pending
                ? "Creating…"
                : `Create ${ready.length} trainer${ready.length === 1 ? "" : "s"}`}
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
          Continue: review services
        </a>
      )}
    </div>
  );
}
