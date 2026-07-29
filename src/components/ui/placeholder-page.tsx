import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

/** Polished placeholder used by routes whose functionality lands in a later phase. */
export function PlaceholderPage({
  title,
  description,
  emptyTitle,
  emptyDescription,
  phase,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  phase: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        phase={phase}
      />
    </div>
  );
}
