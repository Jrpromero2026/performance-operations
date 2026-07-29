import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Configuration" };

export default function ConfigurationPage() {
  return (
    <PlaceholderPage
      title="Configuration"
      description="Organizations, locations, departments, members, services, reporting periods, and compensation plans."
      emptyTitle="Configuration tools not yet available"
      emptyDescription="Management UIs for organizations, departments, members, trainers, services, and reporting periods are the next phase of work. The underlying database schema and authorization model are already in place."
      phase="Phase 2 · Configuration"
    />
  );
}
