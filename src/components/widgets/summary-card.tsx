import { formatMetricValue } from "@/lib/intelligence/format";
import type { ExecutiveSummaryItem } from "@/lib/intelligence/shared/types";
import { Widget, WidgetEmpty } from "./section";

/** Executive summary widget — deterministic engine summaries, verbatim. */
export function SummaryCard({
  items,
  title = "Executive summary",
  testId,
}: {
  items: ExecutiveSummaryItem[];
  title?: string;
  testId?: string;
}) {
  return (
    <Widget title={title} testId={testId}>
      {items.length === 0 ? (
        <WidgetEmpty reason="Summaries appear once a reporting period is selected." />
      ) : (
        <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.code} data-summary={item.code}>
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">
                {item.headline}
              </p>
              {item.subject ? (
                <p className="mt-0.5 text-sm font-semibold text-ink">
                  {item.subject}
                  <span className="ml-2 font-mono text-xs text-ink-secondary">
                    {formatMetricValue(item.value, item.unit)}
                  </span>
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-ink-muted">{item.detail}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
