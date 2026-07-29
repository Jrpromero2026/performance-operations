import Link from "next/link";
import type { ReactNode } from "react";

/** Dashboard grid — the ONE layout wrapper for widget rows. */
export function DashboardGrid({
  columns = 4,
  children,
}: {
  columns?: 2 | 3 | 4;
  children: ReactNode;
}) {
  const cols =
    columns === 2
      ? "md:grid-cols-2"
      : columns === 3
        ? "md:grid-cols-3"
        : "md:grid-cols-4";
  return <div className={`grid grid-cols-2 gap-3 ${cols}`}>{children}</div>;
}

/** Section header with optional deep link — shared by every dashboard. */
export function SectionHeader({
  title,
  href,
  hrefLabel,
  testId,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  testId?: string;
}) {
  return (
    <div className="flex items-center justify-between" data-testid={testId}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {href && (
        <Link
          href={href}
          className="text-xs font-medium text-accent hover:text-accent-strong"
        >
          {hrefLabel ?? "View all →"}
        </Link>
      )}
    </div>
  );
}

/** Generic widget shell: bordered card with optional title row. */
export function Widget({
  title,
  action,
  children,
  testId,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="rounded-[--radius-card] border border-border bg-surface shadow-sm"
      data-testid={testId}
    >
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          {title && <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

/** Uniform widget-level empty state (honest, reasoned). */
export function WidgetEmpty({ reason }: { reason: string }) {
  return <p className="py-2 text-sm text-ink-muted">{reason}</p>;
}
