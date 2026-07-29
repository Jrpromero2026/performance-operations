/** Signed change indicator (basis points of previous). Presentation only. */
export function TrendIndicator({ changeBp }: { changeBp: number | null }) {
  if (changeBp === null) {
    return <span className="text-xs text-ink-muted">—</span>;
  }
  const positive = changeBp > 0;
  const flat = changeBp === 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono text-xs font-semibold ${
        flat ? "text-ink-muted" : positive ? "text-positive" : "text-negative"
      }`}
    >
      {flat ? "→" : positive ? "▲" : "▼"}
      {(Math.abs(changeBp) / 100).toFixed(1)}%
    </span>
  );
}
