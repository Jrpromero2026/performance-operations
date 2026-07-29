import {
  formatMetricValue,
  HEALTH_CLASS,
  HEALTH_LABEL,
} from "@/lib/intelligence/format";
import type { MetricResult } from "@/lib/intelligence/shared/types";

/**
 * THE metric tile. Renders exactly what the intelligence engine returned —
 * value, unit formatting, health badge, first reason/warning. Widgets never
 * calculate metrics.
 */
export function MetricCard({
  result,
  label,
}: {
  result: MetricResult;
  label: string;
}) {
  const showBadge = result.health !== "healthy";
  return (
    <div
      className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm"
      data-metric={result.metricId}
      data-health={result.health}
    >
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-ink">
        {formatMetricValue(result.value, result.unit)}
      </p>
      {showBadge && (
        <span
          className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${HEALTH_CLASS[result.health]}`}
        >
          {HEALTH_LABEL[result.health]}
        </span>
      )}
      {result.reasons.length > 0 && (
        <p className="mt-1 text-[11px] leading-4 text-ink-muted">{result.reasons[0]}</p>
      )}
      {result.warnings.length > 0 && (
        <p className="mt-1 text-[11px] leading-4 text-warning">{result.warnings[0]}</p>
      )}
    </div>
  );
}
