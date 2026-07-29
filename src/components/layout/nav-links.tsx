"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

/** Sidebar/mobile navigation list with active-route highlighting. */
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-0.5 px-3">
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-[--radius-control] px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-nav-raised text-nav-fg shadow-[inset_2px_0_0_0_var(--color-accent)]"
                : "text-nav-muted hover:bg-nav-raised/60 hover:text-nav-fg"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-[18px] w-[18px] shrink-0 ${
                active ? "text-accent" : "text-nav-muted group-hover:text-nav-fg"
              }`}
              aria-hidden
            >
              <path d={item.iconPath} />
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
