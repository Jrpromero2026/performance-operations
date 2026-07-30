/**
 * Chart system — the ONE chart layer for analytics surfaces. Pure SVG,
 * server-rendered, theme-token colors, unit-aware formatting via the
 * intelligence format module (pages never implement chart formatting).
 *
 * Accessibility contract (every chart): accessible title + description,
 * <title> tooltips on marks, a real data-table fallback (ChartShell), and
 * meaning never encoded by color alone (labels/values always present).
 * Health and finality render as text badges, not colors.
 */

import type { ReactNode } from "react";
import { formatMetricValue, HEALTH_CLASS, HEALTH_LABEL } from "@/lib/intelligence/format";
import type { MetricHealth, MetricUnit } from "@/lib/intelligence/shared/types";

/* Controlled semantic palette — series never use the alert colors. */
export const SERIES_COLORS = [
  "var(--color-info)",
  "var(--color-ink-secondary)",
  "var(--color-positive)",
  "var(--color-warning)",
] as const;

export interface ChartPoint {
  /** Short axis label, e.g. 2026-07 or a week key. */
  key: string;
  /** Human label for tooltips/tables (period label). */
  label: string;
  value: number | null;
  health?: MetricHealth;
}

/* ------------------------------------------------------------ ChartShell */

/**
 * Frame every chart renders inside: header (title/description/health),
 * the chart, and a keyboard-reachable data-table fallback.
 */
export function ChartShell({
  title,
  description,
  unit,
  health,
  finalityNote,
  points,
  children,
  testId,
}: {
  title: string;
  description: string;
  unit: MetricUnit;
  health?: MetricHealth;
  finalityNote?: string;
  points: ChartPoint[];
  children: ReactNode;
  testId?: string;
}) {
  const empty = points.length === 0;
  const allUnavailable = !empty && points.every((p) => p.value === null);
  return (
    <figure
      className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm"
      data-testid={testId}
      data-chart-health={health ?? "healthy"}
    >
      <figcaption>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">{title}</span>
          {health && health !== "healthy" && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${HEALTH_CLASS[health]}`}
            >
              {HEALTH_LABEL[health]}
            </span>
          )}
          {finalityNote && (
            <span className="rounded bg-surface-sunken px-1.5 text-[10px] font-bold uppercase text-ink-secondary">
              {finalityNote}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-ink-muted">{description}</span>
      </figcaption>

      {empty ? (
        <p className="py-8 text-center text-sm text-ink-muted">No data in this window.</p>
      ) : allUnavailable ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          Values are unavailable for this window — see the health badge for why.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">{children}</div>
      )}

      {!empty && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-ink-secondary hover:text-ink">
            View data table
          </summary>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th scope="col" className="py-1 pr-2 font-medium">Period</th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">Value</th>
                <th scope="col" className="py-1 font-medium">Health</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.key} className="border-b border-border/60">
                  <th scope="row" className="py-1 pr-2 text-left font-normal text-ink">
                    {p.label}
                  </th>
                  <td className="py-1 pr-2 text-right font-mono text-ink">
                    {formatMetricValue(p.value, unit)}
                  </td>
                  <td className="py-1 text-ink-muted">
                    {p.health ? HEALTH_LABEL[p.health] : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </figure>
  );
}

/* ---------------------------------------------------------- scale helpers */

function niceMax(values: number[]): number {
  const max = Math.max(0, ...values);
  if (max === 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

/* --------------------------------------------------------------- LineChart */

export function LineChartSvg({
  points,
  unit,
  width = 640,
  height = 200,
  area = false,
}: {
  points: ChartPoint[];
  unit: MetricUnit;
  width?: number;
  height?: number;
  area?: boolean;
}) {
  const pad = { top: 12, right: 12, bottom: 26, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const numeric = points.filter((p) => p.value !== null) as (ChartPoint & { value: number })[];
  const hasNegative = numeric.some((p) => p.value < 0);
  const max = niceMax(numeric.map((p) => p.value));
  const min = hasNegative ? -niceMax(numeric.map((p) => -Math.min(0, p.value))) : 0;
  const x = (i: number) =>
    pad.left + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const y = (v: number) => pad.top + innerH - ((v - min) / (max - min)) * innerH;

  const path = numeric.length
    ? points
        .map((p, i) => (p.value === null ? null : `${x(i)},${y(p.value)}`))
        .filter(Boolean)
        .map((c, i) => `${i === 0 ? "M" : "L"}${c}`)
        .join(" ")
    : "";
  const gridLines = [0, 0.5, 1].map((f) => min + (max - min) * f);
  const labelStep = Math.max(1, Math.ceil(points.length / 8));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Trend chart; data table below"
      className="min-w-[320px]"
    >
      {gridLines.map((v) => (
        <g key={v}>
          <line
            x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)}
            stroke="var(--color-border)" strokeWidth="1"
          />
          <text
            x={pad.left - 6} y={y(v) + 3} textAnchor="end"
            fontSize="10" fill="var(--color-ink-muted)"
          >
            {formatMetricValue(Math.round(v), unit)}
          </text>
        </g>
      ))}
      {area && path && (
        <path
          d={`${path} L${x(points.length - 1)},${y(Math.max(0, min))} L${x(0)},${y(Math.max(0, min))} Z`}
          fill="var(--color-info-soft)"
        />
      )}
      {path && (
        <path d={path} fill="none" stroke={SERIES_COLORS[0]} strokeWidth="2" />
      )}
      {points.map((p, i) =>
        p.value === null ? (
          <text
            key={p.key} x={x(i)} y={pad.top + innerH / 2}
            textAnchor="middle" fontSize="9" fill="var(--color-ink-faint)"
          >
            ×
          </text>
        ) : (
          <circle key={p.key} cx={x(i)} cy={y(p.value)} r="2.5" fill={SERIES_COLORS[0]}>
            <title>{`${p.label}: ${formatMetricValue(p.value, unit)}`}</title>
          </circle>
        ),
      )}
      {points.map((p, i) =>
        i % labelStep === 0 ? (
          <text
            key={p.key} x={x(i)} y={height - 8}
            textAnchor="middle" fontSize="9" fill="var(--color-ink-muted)"
          >
            {p.key}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/* ---------------------------------------------------------------- BarChart */

export function BarChartSvg({
  points,
  unit,
  width = 640,
  height = 200,
}: {
  points: ChartPoint[];
  unit: MetricUnit;
  width?: number;
  height?: number;
}) {
  const pad = { top: 12, right: 12, bottom: 26, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const numeric = points.filter((p) => p.value !== null).map((p) => p.value!) as number[];
  const max = niceMax(numeric);
  const band = innerW / Math.max(1, points.length);
  const barW = Math.min(40, band * 0.7);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const labelStep = Math.max(1, Math.ceil(points.length / 8));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Bar chart; data table below"
      className="min-w-[320px]"
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={pad.left} x2={width - pad.right} y1={y(max * f)} y2={y(max * f)}
            stroke="var(--color-border)" strokeWidth="1"
          />
          <text
            x={pad.left - 6} y={y(max * f) + 3} textAnchor="end"
            fontSize="10" fill="var(--color-ink-muted)"
          >
            {formatMetricValue(Math.round(max * f), unit)}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const cx = pad.left + band * i + band / 2;
        if (p.value === null) {
          return (
            <text
              key={p.key} x={cx} y={y(0) - 4}
              textAnchor="middle" fontSize="9" fill="var(--color-ink-faint)"
            >
              n/a
            </text>
          );
        }
        return (
          <rect
            key={p.key}
            x={cx - barW / 2} y={y(Math.max(0, p.value))}
            width={barW} height={Math.abs(y(0) - y(p.value)) || 1}
            rx="2" fill={SERIES_COLORS[0]}
          >
            <title>{`${p.label}: ${formatMetricValue(p.value, unit)}`}</title>
          </rect>
        );
      })}
      {points.map((p, i) =>
        i % labelStep === 0 ? (
          <text
            key={p.key}
            x={pad.left + band * i + band / 2} y={height - 8}
            textAnchor="middle" fontSize="9" fill="var(--color-ink-muted)"
          >
            {p.key}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/* ------------------------------------------------------- HorizontalBarSvg */

export function HorizontalBarSvg({
  rows,
  unit,
  width = 640,
}: {
  rows: { key: string; label: string; value: number | null }[];
  unit: MetricUnit;
  width?: number;
}) {
  const rowH = 24;
  const pad = { top: 4, right: 90, bottom: 4, left: 150 };
  const height = pad.top + pad.bottom + rows.length * rowH;
  const innerW = width - pad.left - pad.right;
  const max = niceMax(rows.filter((r) => r.value !== null).map((r) => r.value!));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Horizontal bar chart; data table below"
      className="min-w-[320px]"
    >
      {rows.map((r, i) => {
        const cy = pad.top + i * rowH + rowH / 2;
        const w = r.value === null ? 0 : Math.max(1, (r.value / max) * innerW);
        return (
          <g key={r.key}>
            <text
              x={pad.left - 8} y={cy + 3} textAnchor="end"
              fontSize="11" fill="var(--color-ink)"
            >
              {r.label.length > 22 ? `${r.label.slice(0, 21)}…` : r.label}
            </text>
            {r.value === null ? (
              <text x={pad.left} y={cy + 3} fontSize="10" fill="var(--color-ink-faint)">
                unavailable
              </text>
            ) : (
              <>
                <rect
                  x={pad.left} y={cy - 7} width={w} height="14" rx="2"
                  fill={SERIES_COLORS[0]}
                >
                  <title>{`${r.label}: ${formatMetricValue(r.value, unit)}`}</title>
                </rect>
                <text
                  x={pad.left + w + 6} y={cy + 3}
                  fontSize="10" fontFamily="var(--font-mono)" fill="var(--color-ink-secondary)"
                >
                  {formatMetricValue(r.value, unit)}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------- Sparkline */

export function SparklineSvg({
  points,
  width = 120,
  height = 28,
}: {
  points: ChartPoint[];
  width?: number;
  height?: number;
}) {
  const numeric = points.filter((p) => p.value !== null) as (ChartPoint & { value: number })[];
  if (numeric.length < 2) {
    return <span className="text-[10px] text-ink-faint">not enough data</span>;
  }
  const values = numeric.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (numeric.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const path = numeric.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width} height={height}
      role="img" aria-label="Sparkline; values in adjacent table"
    >
      <path d={path} fill="none" stroke="var(--color-ink-secondary)" strokeWidth="1.5" />
      <circle
        cx={x(numeric.length - 1)} cy={y(numeric[numeric.length - 1].value)}
        r="2" fill="var(--color-accent)"
      />
    </svg>
  );
}

/* --------------------------------------------------------- GoalProgressBar */

export function GoalProgressBar({
  percentToTargetBp,
  timeElapsedBp,
  label,
}: {
  percentToTargetBp: number | null;
  timeElapsedBp: number;
  label: string;
}) {
  const pct = percentToTargetBp === null ? null : Math.min(100, percentToTargetBp / 100);
  const elapsed = Math.min(100, timeElapsedBp / 100);
  return (
    <div aria-label={label}>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-sunken">
        {pct !== null && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-info"
            style={{ width: `${pct}%` }}
          />
        )}
        {/* time-elapsed tick: where a linearly prorated target would sit */}
        <div
          className="absolute inset-y-0 w-0.5 bg-ink-secondary"
          style={{ left: `${elapsed}%` }}
          title="Share of the goal window elapsed"
        />
      </div>
      <p className="mt-1 text-[11px] text-ink-muted">
        {pct === null
          ? "Percent to target is not derivable for this goal."
          : `${(percentToTargetBp! / 100).toFixed(1)}% of target · ${(timeElapsedBp / 100).toFixed(0)}% of the window elapsed`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ HeatMapTable */

/**
 * Cohort heat map — an HTML table with shaded cells (screen-reader and
 * keyboard-accessible by construction; shading intensity is redundant with
 * the printed number, never the only signal).
 */
export function HeatMapTable({
  columnLabels,
  rows,
  caption,
}: {
  columnLabels: string[];
  rows: {
    key: string;
    label: string;
    cells: { key: string; value: number | null; suppressed?: boolean }[];
  }[];
  caption: string;
}) {
  const max = Math.max(
    1,
    ...rows.flatMap((r) => r.cells.map((c) => c.value ?? 0)),
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" data-testid="cohort-heatmap">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-ink-muted">
            <th scope="col" className="py-1 pr-2 font-medium">Cohort</th>
            {columnLabels.map((c) => (
              <th key={c} scope="col" className="px-1 py-1 text-right font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-border/60">
              <th scope="row" className="py-1 pr-2 text-left font-normal text-ink">
                {row.label}
              </th>
              {row.cells.map((cell) => {
                const intensity = cell.value === null ? 0 : cell.value / max;
                return (
                  <td
                    key={cell.key}
                    className="px-1 py-1 text-right font-mono"
                    style={
                      cell.value !== null && cell.value > 0
                        ? {
                            backgroundColor: `color-mix(in srgb, var(--color-info) ${Math.round(
                              10 + intensity * 35,
                            )}%, var(--color-surface))`,
                          }
                        : undefined
                    }
                  >
                    {cell.suppressed ? (
                      <span title="Suppressed — below the privacy threshold">•</span>
                    ) : cell.value === null ? (
                      <span className="text-ink-faint">—</span>
                    ) : (
                      cell.value
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
