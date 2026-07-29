const STYLES: Record<string, string> = {
  active: "bg-positive-soft text-positive",
  inactive: "bg-surface-sunken text-ink-muted",
  draft: "bg-surface-sunken text-ink-secondary",
  open: "bg-info-soft text-info",
  closed: "bg-warning-soft text-warning",
  locked: "bg-negative-soft text-negative",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? "bg-surface-sunken text-ink-secondary";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${style}`}
    >
      {status}
    </span>
  );
}
