// renderToStaticMarkup needs no DOM — these run in the node environment.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BarChartSvg,
  ChartShell,
  GoalProgressBar,
  HeatMapTable,
  HorizontalBarSvg,
  LineChartSvg,
  SparklineSvg,
  type ChartPoint,
} from "@/components/charts/charts";

const POINTS: ChartPoint[] = [
  { key: "2026-05", label: "May 2026", value: 100, health: "healthy" },
  { key: "2026-06", label: "June 2026", value: 12550, health: "healthy" },
  { key: "2026-07", label: "July 2026", value: null, health: "waiting_for_imports" },
];

describe("chart system", () => {
  it("renders unit-aware currency formatting in the table fallback", () => {
    const html = renderToStaticMarkup(
      <ChartShell
        title="Listed amount"
        description="test"
        unit="cents"
        points={POINTS}
      >
        <BarChartSvg points={POINTS} unit="cents" />
      </ChartShell>,
    );
    expect(html).toContain("$125.50");
    expect(html).toContain("View data table");
    expect(html).toContain("Waiting for imports"); // health, not hidden
  });

  it("marks unavailable points instead of zero-filling", () => {
    const html = renderToStaticMarkup(<BarChartSvg points={POINTS} unit="count" />);
    expect(html).toContain("n/a"); // null renders as a marker, never a zero bar
  });

  it("renders an explicit empty state", () => {
    const html = renderToStaticMarkup(
      <ChartShell title="Empty" description="d" unit="count" points={[]}>
        <span />
      </ChartShell>,
    );
    expect(html).toContain("No data in this window");
  });

  it("renders an all-unavailable state distinct from empty", () => {
    const html = renderToStaticMarkup(
      <ChartShell
        title="Unavailable"
        description="d"
        unit="count"
        health="waiting_for_payroll"
        points={[{ key: "a", label: "A", value: null, health: "waiting_for_payroll" }]}
      >
        <span />
      </ChartShell>,
    );
    expect(html).toContain("Values are unavailable");
    expect(html).toContain("Waiting for payroll");
  });

  it("line chart includes accessible tooltips and axis labels", () => {
    const html = renderToStaticMarkup(<LineChartSvg points={POINTS} unit="count" />);
    expect(html).toContain("role=\"img\"");
    expect(html).toContain("<title>June 2026: 12550</title>");
  });

  it("horizontal bars print their values as text (not color-only)", () => {
    const html = renderToStaticMarkup(
      <HorizontalBarSvg
        unit="rate_bp"
        rows={[
          { key: "a", label: "Strength", value: 9250 },
          { key: "b", label: "Pilates", value: null },
        ]}
      />,
    );
    expect(html).toContain("92.50%");
    expect(html).toContain("unavailable");
  });

  it("sparkline refuses to draw from a single point", () => {
    const html = renderToStaticMarkup(
      <SparklineSvg points={[{ key: "a", label: "A", value: 5 }]} />,
    );
    expect(html).toContain("not enough data");
  });

  it("goal progress bar states its numbers in text", () => {
    const html = renderToStaticMarkup(
      <GoalProgressBar percentToTargetBp={7550} timeElapsedBp={5000} label="Goal" />,
    );
    expect(html).toContain("75.5% of target");
    expect(html).toContain("50% of the window elapsed");
  });

  it("heat map is a real table with suppressed-cell markers", () => {
    const html = renderToStaticMarkup(
      <HeatMapTable
        caption="cohorts"
        columnLabels={["2026-06", "2026-07"]}
        rows={[
          {
            key: "2026-06",
            label: "2026-06 (4 new)",
            cells: [
              { key: "2026-06", value: 4 },
              { key: "2026-07", value: null, suppressed: true },
            ],
          },
        ]}
      />,
    );
    expect(html).toContain("<table");
    expect(html).toContain("Suppressed — below the privacy threshold");
  });
});
