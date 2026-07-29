"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { COMMANDS, filterCommands } from "@/lib/operations/commands";
import { searchApp, type SearchResultItem } from "@/lib/actions/operations";

/**
 * Global command palette + search (Ctrl/Cmd+K). Static pages/actions are
 * filtered client-side against the actor's granted permissions; entity
 * results come from the ONE permission-aware server search. Selecting a
 * result navigates — the palette performs no business logic.
 */
export function CommandPalette({
  organizationId,
  permissions,
}: {
  organizationId: string | null;
  permissions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [entityResults, setEntityResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);

  const toggle = useCallback(() => {
    setOpen((current) => !current);
    setQuery("");
    setEntityResults([]);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced entity search through the single server implementation. State
  // updates happen inside the timer so the effect never sets state
  // synchronously (no cascading renders).
  useEffect(() => {
    const seq = ++requestSeq.current;
    const shouldSearch = open && organizationId && query.trim().length >= 2;
    const timer = setTimeout(
      async () => {
        if (requestSeq.current !== seq) return;
        if (!shouldSearch) {
          setEntityResults([]);
          setSearching(false);
          return;
        }
        setSearching(true);
        try {
          const { results } = await searchApp(organizationId!, query);
          if (requestSeq.current === seq) setEntityResults(results);
        } finally {
          if (requestSeq.current === seq) setSearching(false);
        }
      },
      shouldSearch ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [open, organizationId, query]);

  const commandMatches = useMemo(
    () => filterCommands(COMMANDS, permissions, query).slice(0, 8),
    [permissions, query],
  );

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const groupedEntities = useMemo(() => {
    const groups = new Map<string, SearchResultItem[]>();
    for (const result of entityResults) {
      const list = groups.get(result.group) ?? [];
      list.push(result);
      groups.set(result.group, list);
    }
    return [...groups.entries()];
  }, [entityResults]);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label="Open search and command palette"
        className="hidden h-9 items-center gap-2 rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink-muted shadow-sm hover:border-border-strong md:flex"
        data-testid="open-palette"
      >
        <span>Search…</span>
        <kbd className="rounded border border-border bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
          Ctrl K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh]"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-[--radius-card] border border-border bg-surface shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Command palette"
            data-testid="command-palette"
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages, actions, trainers, payroll, imports…"
              aria-label="Palette search"
              className="h-12 w-full border-b border-border bg-surface px-4 text-sm text-ink outline-none"
            />
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {commandMatches.length === 0 && groupedEntities.length === 0 && !searching && (
                <p className="px-3 py-6 text-center text-sm text-ink-muted">
                  No matches{query ? ` for “${query}”` : ""}.
                </p>
              )}
              {(["Pages", "Actions"] as const).map((group) => {
                const items = commandMatches.filter((c) => c.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group} className="mb-1">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                      {group}
                    </p>
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => go(item.href)}
                        className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken"
                      >
                        {item.label}
                        <span className="font-mono text-[10px] text-ink-muted">{item.href}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {searching && (
                <p className="px-3 py-1.5 text-xs text-ink-muted">Searching…</p>
              )}
              {groupedEntities.map(([group, items]) => (
                <div key={group} className="mb-1">
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    {group}
                  </p>
                  {items.map((item, index) => (
                    <button
                      key={`${item.href}-${index}`}
                      type="button"
                      onClick={() => go(item.href)}
                      className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken"
                    >
                      <span className="truncate">{item.label}</span>
                      <span className="ml-3 shrink-0 text-[11px] text-ink-muted">{item.sublabel}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
