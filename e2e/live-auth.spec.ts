import { expect, test, type Page } from "@playwright/test";

/**
 * Live suite: runs against the configured dev environment (:3000) and the
 * dedicated performance-operations-dev Supabase project, signed in as the
 * seeded E2E platform admin. Mutation coverage is net-zero (create + revoke).
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/overview");
}

test("unauthenticated users are redirected to login with destination preserved", async ({
  page,
}) => {
  await page.goto("/payroll");
  await page.waitForURL("**/login?next=%2Fpayroll");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("sign in lands on overview with real workspace data, then sign out", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Timberhill Athletic Club" })
  ).toBeVisible();
  // Real config counts render (numbers, not fake financials).
  await expect(page.getByText("Active Trainers")).toBeVisible();
  await expect(page.getByText("Awaiting Import Center").first()).toBeVisible();

  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL("**/login");

  // Session is really gone.
  await page.goto("/overview");
  await page.waitForURL("**/login**");
});

test("preserved destination is honored after sign-in", async ({ page }) => {
  await page.goto("/configuration");
  await page.waitForURL("**/login?next=%2Fconfiguration");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/configuration");
  await expect(
    page.getByRole("heading", { name: "Configuration", exact: true })
  ).toBeVisible();
});

test("authenticated users are bounced away from /login", async ({ page }) => {
  await signIn(page);
  await page.goto("/login");
  await page.waitForURL("**/overview");
});

test("workspace switching rescopes live data and persists", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("Workspace").selectOption({ label: "G3 Sports & Fitness" });
  await expect(
    page.getByRole("heading", { name: "G3 Sports & Fitness" })
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "Athlete Performance" })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "G3 Sports & Fitness" })
  ).toBeVisible();
  // Reset for other tests.
  await page.getByLabel("Workspace").selectOption({ label: "Timberhill Athletic Club" });
});

test("invalid and missing invite tokens are handled", async ({ page }) => {
  await page.goto("/accept-invite");
  await expect(page.getByText("Invalid invitation link")).toBeVisible();
  await page.goto(
    "/accept-invite?token=this-token-does-not-exist-anywhere-000000"
  );
  await expect(page.getByText("Invitation not found")).toBeVisible();
});

test("forgot-password never reveals whether an email exists", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("no-such-user@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByText("If an account exists for that address", { exact: false })
  ).toBeVisible();
});

test("admin can create and revoke an invitation (net-zero mutation)", async ({
  page,
}) => {
  const email = `e2e-invite-${Date.now()}@perfops.local`;
  await signIn(page);
  await page.goto("/configuration/users");
  await expect(
    page.getByRole("heading", { name: "Users & Access" })
  ).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByText("Invitation created.", { exact: false })).toBeVisible();
  await expect(page.locator("code", { hasText: "/accept-invite?token=" })).toBeVisible();

  // The pending invite appears; revoke it to leave the database unchanged.
  const row = page.getByRole("row", { name: new RegExp(email) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("row", { name: new RegExp(email) })).toBeHidden();
});

test("configuration hub shows readiness without claiming payroll-ready", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/configuration");
  await expect(page.getByText("Setup readiness by organization")).toBeVisible();
  await expect(page.getByText("Not payroll-ready", { exact: false }).first()).toBeVisible();
});

test("audit viewer lists events with filters", async ({ page }) => {
  await signIn(page);
  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "Audit", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filter" })).toBeVisible();
});
