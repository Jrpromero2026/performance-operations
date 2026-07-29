import { expect, test as setup } from "@playwright/test";

/**
 * One-time sign-in for the live suite: authenticates the seeded E2E admin,
 * selects the Timberhill workspace, and saves storage state for every
 * authenticated test — avoiding one password grant per test (Supabase auth
 * rate limits).
 */

const STATE_PATH = "test-results/.auth/live-admin.json";

setup("authenticate live admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL ?? "");
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/overview");
  await page.getByLabel("Workspace").selectOption({ label: "Timberhill Athletic Club" });
  await expect(
    page.getByRole("heading", { name: "Timberhill Athletic Club" })
  ).toBeVisible();
  await page.context().storageState({ path: STATE_PATH });
});

export { STATE_PATH };
