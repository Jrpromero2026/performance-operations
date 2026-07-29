import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <PlaceholderPage
      title="Reports"
      description="Payroll registers, trainer scorecards, department KPI reports, and period close-out exports."
      emptyTitle="Reporting not yet available"
      emptyDescription="Reports are generated from approved payroll and posted analytics data. Export formats (CSV/PDF) are delivered in the Reports phase."
      phase="Phase 6 · Reports"
    />
  );
}
