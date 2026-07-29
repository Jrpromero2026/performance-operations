import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Payroll" };

export default function PayrollPage() {
  return (
    <PlaceholderPage
      title="Payroll"
      description="Payroll runs per organization and reporting period: Draft → In Review → Approved → Posted → Locked."
      emptyTitle="Payroll engine not yet available"
      emptyDescription="Payroll calculation requires versioned compensation plans, effective-dated assignments, and posted appointment data. All amounts will be integer cents with full calculation traces and audited state transitions."
      phase="Phase 4 · Payroll Engine"
    />
  );
}
