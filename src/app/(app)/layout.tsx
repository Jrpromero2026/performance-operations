import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { getWorkspaceContext } from "@/lib/workspace/server";

/**
 * Shared application shell. The workspace context is resolved server-side on
 * every request — the cookie is validated against real access, never trusted.
 * Unauthenticated users in a configured environment never reach this layout's
 * children (middleware redirects first; this is the server-side backstop).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getWorkspaceContext();

  if (context.mode === "unconfigured") {
    return <SetupRequired />;
  }
  if (context.mode === "live" && !context.userId) {
    redirect("/login");
  }

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

function SetupRequired() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-subtle px-6">
      <div className="w-full max-w-lg rounded-[--radius-card] border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-ink">
          Environment not configured
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Supabase environment variables are missing. Copy{" "}
          <span className="font-mono text-xs">.env.example</span> to{" "}
          <span className="font-mono text-xs">.env.local</span> and fill in the
          dedicated Performance Operations project values (see the README), or
          set{" "}
          <span className="font-mono text-xs">
            NEXT_PUBLIC_DEV_OFFLINE_PREVIEW=true
          </span>{" "}
          for an explicit offline UI preview with no real data.
        </p>
      </div>
    </div>
  );
}
