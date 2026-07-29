import type { WorkspaceContext } from "@/lib/workspace/server";
import type { PeriodContext } from "@/lib/period/server";
import { MobileNav } from "./mobile-nav";
import { PeriodSelector } from "./period-selector";
import { UserMenu } from "./user-menu";
import { WorkspaceSelector } from "./workspace-selector";

/** Application header: workspace selector, reporting-period selector, user menu. */
export function Header({
  context,
  periods,
}: {
  context: WorkspaceContext;
  periods: PeriodContext;
}) {
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
            title="Explicit development preview: Supabase is not configured; showing seed-mirroring data only."
          >
            Offline preview
          </span>
        )}
        <WorkspaceSelector
          options={context.options}
          selection={context.selection}
          canAccessAll={context.canAccessAll}
        />
        <PeriodSelector
          options={periods.options}
          selectedId={periods.selected?.id ?? null}
          selectable={periods.selectable}
        />
        <UserMenu
          userName={context.userName}
          userEmail={context.userEmail}
          canSignOut={context.mode === "live" && Boolean(context.userId)}
        />
      </div>
    </header>
  );
}
