"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  userName: string | null;
  userEmail: string | null;
}

/** Current-user menu. Sign-in flows arrive with Supabase Auth in Phase 2. */
export function UserMenu({ userName, userEmail }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const label = userName ?? "Not signed in";
  const initials = userName
    ? userName
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "–";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="User menu"
        className="flex h-9 items-center gap-2 rounded-[--radius-control] border border-border bg-surface px-2.5 shadow-sm hover:border-border-strong"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-nav text-[11px] font-semibold text-nav-fg">
          {initials}
        </span>
        <span className="hidden sm:block max-w-[140px] truncate text-sm font-medium text-ink">
          {label}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 text-ink-muted"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1.5 w-64 rounded-[--radius-card] border border-border bg-surface p-1 shadow-lg"
        >
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-sm font-semibold text-ink">{label}</p>
            <p className="truncate text-xs text-ink-muted">
              {userEmail ?? "Authentication is configured in Phase 2"}
            </p>
          </div>
          <div className="px-3 py-2.5">
            <p className="text-xs text-ink-muted">
              Profile, preferences, and sign-out will appear here once
              Supabase Auth is connected.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
