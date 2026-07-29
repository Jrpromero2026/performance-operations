import { NavLinks } from "./nav-links";

/** Desktop sidebar — dark charcoal navigation column. */
export function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:w-60 lg:flex-col bg-nav border-r border-nav-border">
      <div className="flex h-14 items-center gap-2.5 px-5 border-b border-nav-border">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-accent text-[13px] font-bold text-white">
          PO
        </div>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold text-nav-fg">
            Performance Operations
          </p>
          <p className="text-[10px] uppercase tracking-wider text-nav-muted">
            Internal Platform
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <NavLinks />
      </div>
      <div className="border-t border-nav-border px-5 py-3">
        <p className="text-[10px] uppercase tracking-wider text-nav-muted">
          Phase 1 · Foundation
        </p>
      </div>
    </aside>
  );
}
