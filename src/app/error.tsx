"use client";

import { useEffect } from "react";

/** Root error boundary. Shows a recoverable state; never leaks internals. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Digest only — safe to log; full errors stay server-side.
    console.error("Application error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-subtle px-6">
      <div className="w-full max-w-md rounded-[--radius-card] border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-negative-soft">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            className="h-5 w-5 text-negative"
            aria-hidden
          >
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </div>
        <h1 className="mt-4 text-lg font-semibold text-ink">
          Something went wrong
        </h1>
        <p className="mt-1.5 text-sm text-ink-secondary">
          An unexpected error occurred. Your data is unaffected — no financial
          records are modified by viewing pages.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-ink-muted">
            Reference: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
