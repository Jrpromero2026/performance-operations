import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { getWorkspaceContext } from "@/lib/workspace/server";

/**
 * Shared application shell: charcoal sidebar, workspace-aware header, and
 * the light data surface. The workspace context is resolved server-side on
 * every request — the cookie is validated against real access, never trusted.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getWorkspaceContext();
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header context={context} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
