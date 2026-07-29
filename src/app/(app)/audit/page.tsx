import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Audit" };

export default function AuditPage() {
  return (
    <PlaceholderPage
      title="Audit"
      description="Append-only audit trail of every governed change, scoped to your accessible organizations."
      emptyTitle="No audit activity to display"
      emptyDescription="Audit events are recorded automatically as memberships, assignments, periods, imports, and payroll change. The full searchable audit view arrives with the Configuration phase; recent activity already appears on the Overview page."
      phase="Phase 2 · Configuration"
    />
  );
}
