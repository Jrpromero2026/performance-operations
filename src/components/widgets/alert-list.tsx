import Link from "next/link";
import type { OperationalAlert } from "@/lib/operations/alerts";
import { Widget, WidgetEmpty } from "./section";

const SEVERITY_CLASS: Record<OperationalAlert["severity"], string> = {
  critical: "bg-negative-soft text-negative",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

/** Operational alert list — rendered from derived alerts, deep links only. */
export function AlertListCard({
  alerts,
  title = "Operational alerts",
  limit,
  testId,
}: {
  alerts: OperationalAlert[];
  title?: string;
  limit?: number;
  testId?: string;
}) {
  const visible = limit ? alerts.slice(0, limit) : alerts;
  return (
    <Widget title={title} testId={testId}>
      {visible.length === 0 ? (
        <WidgetEmpty reason="No open operational alerts." />
      ) : (
        <ul className="space-y-2.5">
          {visible.map((alert) => (
            <li key={alert.id} data-alert={alert.code}>
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_CLASS[alert.severity]}`}
                >
                  {alert.severity}
                </span>
                <div className="min-w-0">
                  <Link href={alert.link} className="text-sm font-medium text-ink hover:text-accent">
                    {alert.title}
                  </Link>
                  <p className="truncate text-xs text-ink-secondary">{alert.detail}</p>
                  <p className="text-[11px] text-ink-muted">→ {alert.action}</p>
                </div>
              </div>
            </li>
          ))}
          {limit && alerts.length > limit && (
            <li className="text-xs text-ink-muted">+ {alerts.length - limit} more</li>
          )}
        </ul>
      )}
    </Widget>
  );
}
