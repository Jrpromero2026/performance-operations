import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Trainers" };

export default function TrainersPage() {
  return (
    <PlaceholderPage
      title="Trainers"
      description="Trainer registry with per-organization roles, department assignments, and effective dates."
      emptyTitle="No trainers registered yet"
      emptyDescription="The trainer registry and assignment management UI arrive in the Configuration phase. Provide the trainer roster from docs/INPUTS_REQUIRED.md to seed real records — no sample trainers are fabricated."
      phase="Phase 2 · Configuration"
    />
  );
}
