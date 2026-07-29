/**
 * Runs the Playwright suites sequentially. Next.js permits only one dev
 * server per project directory, so the offline (:3100) and live (:3000)
 * suites cannot share a run. Usage: node scripts/run-e2e.mjs [offline|live|all]
 */
import { spawnSync } from "node:child_process";

const suite = process.argv[2] ?? "all";
const suites = suite === "all" ? ["offline", "live"] : [suite];

for (const current of suites) {
  console.log(`\n▶ Playwright suite: ${current}`);
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["playwright", "test"],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, PW_SUITE: current },
    }
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
