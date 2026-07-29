/**
 * Starts a Next.js dev server in EXPLICIT offline-preview mode on port 3100
 * for the shell E2E suite: Supabase env vars are blanked (process env takes
 * precedence over .env.local) and the offline flag is set. No real data, no
 * auth — structure only.
 */
import { spawn } from "node:child_process";

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev", "-p", "3100"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      NEXT_PUBLIC_DEV_OFFLINE_PREVIEW: "true",
      NEXT_PUBLIC_APP_URL: "http://localhost:3100",
      PORT: "3100",
    },
  }
);

child.on("exit", (code) => process.exit(code ?? 0));
