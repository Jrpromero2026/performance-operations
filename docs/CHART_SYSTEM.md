# Chart System

`src/components/charts/charts.tsx` — the one chart layer for analytics
surfaces. Pages never implement their own chart formatting.

## Design

Pure SVG rendered on the server (no chart library, no client JS for
static charts), colored exclusively with theme tokens
(`var(--color-…)`), and formatted exclusively through
`formatMetricValue` — the same unit rendering every other surface uses.
The series palette is a controlled set (info blue, secondary ink,
positive, warning); the accent red stays reserved for emphasis; alert
colors never become series colors.

Chart types: line (+ area), bar, horizontal bar, sparkline, goal
progress bar, cohort heat-map table. Pie/donut charts are deliberately
absent. Stacked/grouped variants and a variance waterfall get added the
day a surface needs them — with the same contract.

## The ChartShell contract

Every chart renders inside `ChartShell`, which guarantees:

- accessible title + description (`figure`/`figcaption`);
- health badge (engine health, never hidden) and a finality note slot;
- explicit **empty** ("No data in this window") and **all-unavailable**
  states — never a blank axis or fake zeros;
- a real **data-table fallback** (`<details>` → `<table>`) with period
  labels, formatted values, and health per point — the keyboard/screen-
  reader representation and the print-safe fallback;
- wide content scrolls inside the shell, never the page.

Marks carry `<title>` tooltips; null values render explicit markers
("n/a", "×", "unavailable") instead of zero bars; horizontal bars print
their values as text — meaning is never encoded by color alone.

## Testing

`tests/unit/analytics-charts.test.tsx` renders each component with
`renderToStaticMarkup` and asserts currency/rate formatting, empty and
unavailable states, tooltip presence, suppression markers, and the
value-as-text rule.
