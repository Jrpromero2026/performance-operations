import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Appointments" };

export default function AppointmentsPage() {
  return (
    <PlaceholderPage
      title="Appointments"
      description="Posted, normalized appointment records scoped to the selected workspace."
      emptyTitle="No appointment data yet"
      emptyDescription="Appointments appear here after the first approved import is posted. Until then there is nothing to display — this platform never shows fabricated records."
      phase="Phase 3 · Import Center"
    />
  );
}
