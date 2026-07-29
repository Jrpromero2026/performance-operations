"use client";

import { useActionState } from "react";
import {
  addRule,
  addTier,
  createNewVersion,
  publishVersion,
} from "@/lib/actions/compensation";
import type { ActionState } from "@/lib/actions/shared";
import { RULE_TYPES, humanize } from "@/lib/schemas/compensation";

const inputClass =
  "h-9 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm text-ink shadow-sm focus:border-accent";

export function AddTierForm({
  versionId,
  nextSequence,
}: {
  versionId: string;
  nextSequence: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addTier,
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <div>
        <label htmlFor={`tier-seq-${versionId}`} className="mb-1 block text-xs font-medium text-ink-muted">Seq</label>
        <input id={`tier-seq-${versionId}`} name="sequence" type="number" min={1} max={50}
          defaultValue={nextSequence} className={`${inputClass} w-16`} />
      </div>
      <div>
        <label htmlFor={`tier-min-${versionId}`} className="mb-1 block text-xs font-medium text-ink-muted">Min revenue ($)</label>
        <input id={`tier-min-${versionId}`} name="minRevenue" required placeholder="0.00"
          className={`${inputClass} w-32 font-mono`} />
      </div>
      <div>
        <label htmlFor={`tier-max-${versionId}`} className="mb-1 block text-xs font-medium text-ink-muted">Max revenue ($, blank = ∞)</label>
        <input id={`tier-max-${versionId}`} name="maxRevenue" placeholder="10,000.00"
          className={`${inputClass} w-36 font-mono`} />
      </div>
      <div>
        <label htmlFor={`tier-rate-${versionId}`} className="mb-1 block text-xs font-medium text-ink-muted">Rate (%)</label>
        <input id={`tier-rate-${versionId}`} name="ratePercent" required placeholder="50"
          className={`${inputClass} w-24 font-mono`} />
      </div>
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] bg-accent px-3.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Adding…" : "Add tier"}
      </button>
      {state.error && <p role="alert" className="w-full text-xs text-negative">{state.error}</p>}
      {state.message && <p role="status" className="w-full text-xs text-positive">{state.message}</p>}
    </form>
  );
}

export function AddRuleForm({ versionId }: { versionId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addRule,
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <div>
        <label htmlFor={`rule-type-${versionId}`} className="mb-1 block text-xs font-medium text-ink-muted">Rule</label>
        <select id={`rule-type-${versionId}`} name="ruleType" className={inputClass}>
          {RULE_TYPES.map((type) => (
            <option key={type} value={type}>{humanize(type)}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`rule-kind-${versionId}`} className="mb-1 block text-xs font-medium text-ink-muted">Value type</label>
        <select id={`rule-kind-${versionId}`} name="valueKind" className={inputClass}>
          <option value="amount">Dollar amount</option>
          <option value="rate">Percentage</option>
        </select>
      </div>
      <div>
        <label htmlFor={`rule-value-${versionId}`} className="mb-1 block text-xs font-medium text-ink-muted">Value ($ or %)</label>
        <input id={`rule-value-${versionId}`} name="value" required placeholder="45.00 or 50"
          className={`${inputClass} w-32 font-mono`} />
      </div>
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] bg-accent px-3.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Adding…" : "Add rule"}
      </button>
      {state.error && <p role="alert" className="w-full text-xs text-negative">{state.error}</p>}
      {state.message && <p role="status" className="w-full text-xs text-positive">{state.message}</p>}
    </form>
  );
}

export function PublishVersionButton({ versionId }: { versionId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    publishVersion,
    {}
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] bg-positive px-3.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
        {pending ? "Publishing…" : "Publish version"}
      </button>
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
      {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
    </form>
  );
}

export function NewVersionButton({ planId }: { planId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createNewVersion,
    {}
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="planId" value={planId} />
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-60">
        {pending ? "Creating…" : "New draft version"}
      </button>
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
      {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
    </form>
  );
}
