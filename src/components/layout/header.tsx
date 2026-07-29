import type { WorkspaceContext } from "@/lib/workspace/server";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";
import { WorkspaceSelector } from "./workspace-selector";

/** Application header: workspace selector, period placeholder, user menu. */
export function Header({ context }: { context: WorkspaceContext }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
      <MobileNav />
      <p className="lg:hidden text-sm font-semibold text-ink">
        Performance Operations
      </p>
      <div className="ml-auto flex items-center gap-2.5">
        {context.mode === "offline" && (
          <span
            className="hidden md:inline-flex items-center rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning"
            title="Supabase is not configured or no user is signed in; showing seed-mirroring preview data."
          >
            Offline preview
          </span>
        )}
        <WorkspaceSelector
          options={context.options}
          selection={context.selection}
          canAccessAll={context.canAccessAll}
        />
        <button
          type="button"
          disabled
          title="Reporting periods are created in the Configuration phase"
          className="hidden sm:flex h-9 items-center gap-2 rounded-[--radius-control] border border-dashed border-border-strong bg-surface-subtle px-3 text-sm text-ink-muted"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
          </svg>
          No reporting period
        </button>
        <UserMenu
          userName={context.userName}
          userEmail={context.userEmail}
          canSignOut={context.mode === "live" && Boolean(context.userId)}
        />
      </div>
    </header>
  );
}
