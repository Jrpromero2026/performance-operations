import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { Widget, WidgetEmpty } from "./section";

export interface ListRow {
  key: string;
  label: string;
  sublabel?: string;
  value?: string;
  href?: string;
  /** StatusBadge style key + text. */
  status?: { style: string; text: string };
}

/** Generic list widget: label / status / value rows with deep links. */
export function ListCard({
  title,
  rows,
  emptyReason,
  action,
  testId,
}: {
  title: string;
  rows: ListRow[];
  emptyReason: string;
  action?: React.ReactNode;
  testId?: string;
}) {
  return (
    <Widget title={title} action={action} testId={testId}>
      {rows.length === 0 ? (
        <WidgetEmpty reason={emptyReason} />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                {row.href ? (
                  <Link href={row.href} className="block truncate text-sm font-medium text-ink hover:text-accent">
                    {row.label}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-medium text-ink">{row.label}</p>
                )}
                {row.sublabel && (
                  <p className="truncate text-xs text-ink-muted">{row.sublabel}</p>
                )}
              </div>
              <span className="flex shrink-0 items-center gap-2">
                {row.status && (
                  <>
                    <StatusBadge status={row.status.style} />
                    <span className="text-xs text-ink-secondary">{row.status.text}</span>
                  </>
                )}
                {row.value && <span className="font-mono text-xs text-ink">{row.value}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
