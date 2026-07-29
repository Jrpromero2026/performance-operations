"use client";

import { useRef, useTransition } from "react";
import { switchWorkspace } from "@/lib/workspace/actions";
import { ALL_WORKSPACES } from "@/lib/workspace/constants";
import type { WorkspaceSelection } from "@/lib/workspace/resolver";

interface Props {
  options: { id: string; name: string }[];
  selection: WorkspaceSelection;
  canAccessAll: boolean;
}

/**
 * Persistent workspace selector. Submits a server action; the server
 * re-validates the requested workspace against the user's access before
 * persisting it, so the client value is never trusted.
 */
export function WorkspaceSelector({ options, selection, canAccessAll }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const value =
    selection.kind === "all"
      ? ALL_WORKSPACES
      : selection.kind === "organization"
        ? selection.organizationId
        : "";

  return (
    <form ref={formRef} action={switchWorkspace} className="flex items-center">
      <label htmlFor="workspace-selector" className="sr-only">
        Workspace
      </label>
      <div className="relative">
        <select
          id="workspace-selector"
          name="workspace"
          value={value}
          disabled={isPending || options.length === 0}
          onChange={() =>
            startTransition(() => formRef.current?.requestSubmit())
          }
          className="h-9 appearance-none rounded-[--radius-control] border border-border bg-surface pl-3 pr-8 text-sm font-medium text-ink shadow-sm hover:border-border-strong focus:border-accent disabled:opacity-60 max-w-[220px] truncate"
        >
          {options.length === 0 && <option value="">No workspaces</option>}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
          {canAccessAll && (
            <option value={ALL_WORKSPACES}>All Workspaces</option>
          )}
        </select>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </form>
  );
}
