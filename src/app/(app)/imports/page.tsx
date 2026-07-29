import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Imports" };

export default function ImportsPage() {
  return (
    <PlaceholderPage
      title="Imports"
      description="Upload, validate, and post Setmore and Acuity appointment exports for the selected workspace."
      emptyTitle="Import Center not yet available"
      emptyDescription="CSV upload, validation, trainer/client/service matching, and the resolution queue are delivered in the Import Center phase. Provide the sample exports listed in docs/INPUTS_REQUIRED.md to unblock that work."
      phase="Phase 3 · Import Center"
    />
  );
}
