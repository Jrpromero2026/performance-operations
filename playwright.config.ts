import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Two suites, run SEQUENTIALLY (Next.js allows one dev server per project
 * directory) via scripts/run-e2e.mjs, selected by PW_SUITE:
 *  - offline (default): shell/navigation/workspace tests against an EXPLICIT
 *    offline-preview server on :3100 (no Supabase, no auth, no real data).
 *  - live: authentication and admin-workflow tests against :3000 using
 *    .env.local and the seeded E2E admin; skipped when unconfigured.
 */

// Playwright does not auto-load .env.local; parse it for the live suite.
const envLocalPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envLocalPath)) {
  for (const line of fs.readFileSync(envLocalPath, "utf8").split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq > 0 && !line.startsWith("#")) {
      const key = line.slice(0, eq).trim();
      if (!(key in process.env)) process.env[key] = line.slice(eq + 1).trim();
    }
  }
}

const suite = process.env.PW_SUITE === "live" ? "live" : "offline";
const hasLiveEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.E2E_ADMIN_EMAIL &&
    process.env.E2E_ADMIN_PASSWORD
);

const offlineProjects = [
  {
    name: "offline-chromium",
    testIgnore: /live-.*\.spec\.ts/,
    use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3100" },
  },
  {
    name: "offline-mobile",
    testIgnore: /live-.*\.spec\.ts/,
    use: { ...devices["Pixel 7"], baseURL: "http://localhost:3100" },
  },
];

const liveProjects = hasLiveEnv
  ? [
      {
        name: "live",
        testMatch: /live-.*\.spec\.ts/,
        use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3000" },
      },
    ]
  : [];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "on-first-retry",
  },
  projects: suite === "live" ? liveProjects : offlineProjects,
  webServer:
    suite === "live"
      ? hasLiveEnv
        ? [
            {
              command: "npm run dev",
              url: "http://localhost:3000",
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
            },
          ]
        : []
      : [
          {
            command: "node scripts/dev-offline.mjs",
            url: "http://localhost:3100",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
});
