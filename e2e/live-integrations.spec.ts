import { expect, test, type Page } from "@playwright/test";

/**
 * Integration & automation workflow verification — PROVIDER-NEUTRAL and
 * TEST-PROVIDER execution only. Setmore and Acuity are BLOCKED (no
 * credentials); this suite verifies the framework and explicitly asserts
 * the blocked state — it never fakes a real provider.
 *
 * Covers: connection create → credential (Vault) → validate → activate,
 * capability matrix, sync definition + manual sync, resulting import
 * batch REQUIRING review, idempotent re-sync, auth-failure path with
 * alert deep links, credential rotation, delivery channel policy,
 * scheduled-report execution (run now) with delivery jobs, worker batch
 * execution, delivery failure + manual retry, job dead-letter + requeue,
 * pause/resume, disable, and responsive rendering.
 */

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
const CONN_NAME = `E2E Test Conn ${RUN}`;
let connectionId = "";
let batchId = "";

async function selectPeriod(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  const selector = page.locator("#period-selector");
  const optionValue = await selector
    .locator("option", { hasText: "E2E Payroll Window" })
    .first()
    .getAttribute("value");
  expect(optionValue).toBeTruthy();
  await selector.selectOption(optionValue!);
  await page.waitForTimeout(2000);
}

async function runWorker(page: Page, limit = 5) {
  const response = await page.request.post("/api/worker", {
    headers: { "x-worker-secret": process.env.WORKER_SECRET ?? "" },
    data: { limit, worker_id: `e2e-worker-${RUN}` },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    claimed: number;
    succeeded: number;
    permanentlyFailed: number;
    results: { jobType: string; outcome: string; detail: string }[];
  };
}

test("1. provider catalog shows blocked Setmore/Acuity; create draft connection", async ({
  page,
}) => {
  await page.goto("/configuration/integrations");
  await page.getByTestId("provider-catalog").waitFor({ timeout: 20_000 });
  await expect(page.locator('[data-provider="setmore_api"]')).toHaveAttribute(
    "data-provider-status",
    "blocked",
  );
  await expect(page.locator('[data-provider="acuity_api"]')).toHaveAttribute(
    "data-provider-status",
    "blocked",
  );
  await expect(page.locator('[data-provider="test_provider"]')).toHaveAttribute(
    "data-provider-status",
    "available",
  );

  await page.goto("/configuration/integrations/new");
  await page.locator("#conn-provider").selectOption("test_provider");
  await page.locator("#conn-name").fill(CONN_NAME);
  await page.getByRole("button", { name: "Create draft connection" }).click();
  await page.waitForURL(/\/configuration\/integrations\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  connectionId = page.url().match(/integrations\/([0-9a-f-]{36})/)![1]!;
  await expect(page.getByTestId("connection-status")).toHaveText("draft");
});

test("2. submit credentials securely, validate, activate", async ({ page }) => {
  await page.goto(`/configuration/integrations/${connectionId}`);
  await page.locator("#cred-secret").fill(`test_e2e_${RUN}`);
  await page.getByTestId("submit-credential").click();
  // Fingerprint only — the secret value is never echoed back.
  await expect(page.getByText(/fingerprint/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(`test_e2e_${RUN}`)).toHaveCount(0);
  await expect(page.getByTestId("connection-status")).toHaveText("awaiting credentials");

  await page.getByTestId("validate-connection").click();
  await expect(page.getByTestId("connection-status")).toHaveText("active", {
    timeout: 30_000,
  });
  // Capability matrix reflects the adapter declaration.
  await expect(page.getByTestId("capability-matrix")).toContainText("Incremental sync");
});

test("3. create sync definition and run the first sync", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/configuration/integrations/${connectionId}`);
  await page.locator('select[name="window_strategy"]').selectOption("fixed_range");
  await page.locator('input[name="window_start"]').fill("2099-07-01");
  await page.locator('input[name="window_end"]').fill("2099-07-31");
  await page.getByTestId("create-sync-definition").click();
  await expect(page.getByText(/Sync definition created/)).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("run-sync-now").click();
  await expect(page.getByText(/Synced 6 record\(s\) into a new import batch/)).toBeVisible({
    timeout: 60_000,
  });
});

test("4. sync run recorded with cursor + stats; batch requires review", async ({ page }) => {
  // Navigate through the UI (also warms Turbopack's on-demand compile of
  // the nested route, which can transiently 404 on a cold first hit).
  await page.goto(`/configuration/integrations/${connectionId}`);
  await page.getByRole("link", { name: "History" }).click();
  await page.waitForURL(/\/history$/, { timeout: 20_000 });
  const row = page.locator('tr[data-run-status="succeeded"]').first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("manual");

  // Run detail with statistics and the batch deep link.
  await row.getByRole("link").first().click();
  await page.waitForURL(/\/integrations\/runs\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(page.locator('[data-run-field="Records accepted (new evidence)"]')).toHaveText("6");
  await expect(page.getByTestId("sync-run-batch")).toContainText("review, approval, and posting");

  await page.getByTestId("open-sync-batch").click();
  await page.waitForURL(/\/imports\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  batchId = page.url().match(/imports\/([0-9a-f-]{36})/)![1]!;
  // The EXISTING review workflow gates the batch: its status is
  // needs_review / ready_for_approval — never auto-posted.
  await expect(page.getByText(/needs review|ready for approval/i).first()).toBeVisible({
    timeout: 20_000,
  });
});

test("5. re-running the sync is idempotent (no duplicate batch)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/configuration/integrations/${connectionId}`);
  await page.getByTestId("run-sync-now").click();
  await expect(page.getByText(/No changes: 6 record\(s\) already on file/)).toBeVisible({
    timeout: 60_000,
  });
});

test("6. auth failure surfaces classified error, alert, and health entry", async ({ page }) => {
  test.setTimeout(120_000);
  // Rotate to the simulated-failure credential.
  await page.goto(`/configuration/integrations/${connectionId}`);
  await page.locator("#cred-secret").fill(`fail_auth_${RUN}`);
  await page.getByTestId("submit-credential").click();
  await expect(page.getByText(/fingerprint/)).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("run-sync-now").click();
  await expect(page.getByText(/rejected the credential|authentication/i).first()).toBeVisible({
    timeout: 60_000,
  });

  // Health page shows the classified failure with a recommended action.
  await page.goto(`/configuration/integrations/${connectionId}`);
  await page.getByRole("link", { name: "Health" }).click();
  await page.waitForURL(/\/health$/, { timeout: 20_000 });
  await expect(
    page.locator('[data-failure-code="authentication_failed"]').first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Rotate the connection credentials/).first()).toBeVisible();

  // Automation dashboard alert deep-links to the failed run.
  await page.goto("/integrations");
  const alert = page.locator('[data-alert-code="sync_failed"]').first();
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await alert.getByRole("link").click();
  await page.waitForURL(/\/integrations\/runs\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(page.locator('[data-run-field="Failure"]')).toContainText("authentication_failed");
});

test("7. credential rotation restores sync; pause and resume work", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/configuration/integrations/${connectionId}`);
  await page.locator("#cred-secret").fill(`test_e2e_again_${RUN}`);
  await page.getByTestId("submit-credential").click();
  await expect(page.getByText(/fingerprint/)).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("toggle-sync").click();
  await expect(page.getByText(/Sync paused/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("paused").first()).toBeVisible();
  await page.getByTestId("toggle-sync").click();
  await expect(page.getByText(/Sync resumed/)).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("run-sync-now").click();
  await expect(page.getByText(/already on file|Synced \d+ record/).first()).toBeVisible({
    timeout: 60_000,
  });
});

test("8. delivery channel: test mode with default-off policies", async ({ page }) => {
  await page.goto("/integrations/deliveries");
  await page.getByTestId("delivery-channel").waitFor({ timeout: 20_000 });
  await page.locator('select[name="provider"]').selectOption("test");
  await page.getByRole("button", { name: "Save channel" }).click();
  await expect(page.getByText(/TEST MODE/)).toBeVisible({ timeout: 20_000 });
});

test("9. scheduled report: enable execution, run now, worker delivers via test channel", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // Create a definition with the e2e admin as recipient (org member).
  await page.goto("/reports?tab=scheduled");
  await selectPeriod(page);
  await page.goto("/reports?tab=scheduled");
  await page.locator("#sched-type").waitFor({ timeout: 20_000 });
  await page.locator("#sched-type").selectOption("quick_report");
  await page.locator("#sched-frequency").selectOption("daily");
  await page
    .locator("#sched-recipients")
    .fill(process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@perfops.local");
  await page.getByRole("button", { name: "Save definition" }).click();
  await expect(page.getByText(/Definition saved/).first()).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("toggle-execution").first().click();
  await expect(page.getByText(/Execution enabled/).first()).toBeVisible({ timeout: 20_000 });

  // Run now, then assert the DURABLE outcome (revalidation can remount
  // the form and drop the transient toast): a succeeded execution row.
  await page.getByTestId("run-report-now").first().click();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.locator('[data-scheduled-run-status="succeeded"]').count();
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);
  // Active-period honesty labeling.
  await expect(page.getByTestId("scheduled-run-history")).toContainText("not final");

  // Worker executes the queued delivery job through the TEST provider.
  const summary = await runWorker(page);
  expect(summary.claimed).toBeGreaterThan(0);

  await page.goto("/integrations/deliveries");
  await expect(
    page.locator('[data-delivery-status="accepted"]').first(),
  ).toBeVisible({ timeout: 20_000 });
});

test("10. delivery failure (channel unconfigured) then manual retry succeeds", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // Queue a delivery, then unconfigure the channel BEFORE the worker runs.
  await page.goto("/reports?tab=scheduled");
  await selectPeriod(page);
  await page.goto("/reports?tab=scheduled");
  await page.getByTestId("run-report-now").first().waitFor({ timeout: 20_000 });
  const runsBefore = await page.locator("[data-scheduled-run-status]").count();
  await page.getByTestId("run-report-now").first().click();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.locator("[data-scheduled-run-status]").count();
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThan(runsBefore);

  await page.goto("/integrations/deliveries");
  await page.locator('select[name="provider"]').selectOption("none_configured");
  await page.getByRole("button", { name: "Save channel" }).click();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByText(/Channel: none_configured/).count();
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  const summary = await runWorker(page);
  expect(summary.permanentlyFailed).toBeGreaterThan(0);

  await page.reload();
  const failed = page.locator('[data-delivery-status="failed"]').first();
  await expect(failed).toBeVisible({ timeout: 20_000 });

  // Restore the test channel, then retry the failed delivery manually.
  await page.locator('select[name="provider"]').selectOption("test");
  await page.getByRole("button", { name: "Save channel" }).click();
  await expect(page.getByText(/TEST MODE/).first()).toBeVisible({ timeout: 20_000 });
  const acceptedBefore = await page
    .locator('[data-delivery-status="accepted"]')
    .count();
  await page.getByTestId("retry-delivery").first().click();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.locator('[data-delivery-status="accepted"]').count();
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThan(acceptedBefore);
});

test("11. job queue: dead-letter the failed job, requeue with reason, worker completes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/integrations/jobs");
  await page.getByTestId("job-table").waitFor({ timeout: 20_000 });
  const failedRow = page.locator('tr[data-job-status="permanently_failed"]').first();
  await expect(failedRow).toBeVisible({ timeout: 20_000 });

  await failedRow.getByTestId("dead-letter-job").click();
  await expect(page.locator('tr[data-job-status="dead_lettered"]').first()).toBeVisible({
    timeout: 20_000,
  });

  const dlRow = page.locator('tr[data-job-status="dead_lettered"]').first();
  await dlRow.getByTestId("requeue-dead-letter").click();
  await page
    .getByLabel(/Why is this job being requeued\?/)
    .fill("e2e verification requeue after channel fix");
  await page.getByRole("button", { name: "Confirm requeue" }).click();
  await expect(page.locator('tr[data-job-status="queued"]').first()).toBeVisible({
    timeout: 20_000,
  });

  // The requeued delivery job completes idempotently (event already final).
  const summary = await runWorker(page);
  expect(summary.succeeded).toBeGreaterThan(0);
});

test("12. sync-failure signal reaches operators (alert; notification to peers)", async ({
  page,
}) => {
  // notifyPermissionHolders SELF-SUPPRESSES by design: the e2e admin
  // triggered the failure, so their own inbox never shows it — the
  // notification row for the OTHER integration:read holder was verified
  // directly in the database (see PHASE_8_REPORT §28). What the acting
  // operator sees is the pipeline-state alert:
  await page.goto("/integrations");
  await expect(page.locator('[data-alert-code="sync_failed"]').first()).toBeVisible({
    timeout: 20_000,
  });
  // And their notification center still functions (fixture present).
  await page.goto("/notifications?tab=pinned");
  await expect(page.getByText("E2E fixture notification").first()).toBeVisible({
    timeout: 20_000,
  });
});

test("13. disable connection; responsive dashboard; cleanup leaves honest state", async ({
  page,
}) => {
  await page.goto(`/configuration/integrations/${connectionId}`);
  await page.getByTestId("disable-connection").click();
  await expect(page.getByTestId("connection-status")).toHaveText("disabled", {
    timeout: 20_000,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/integrations");
  await expect(page.getByTestId("connection-health")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("job-queue-summary")).toBeVisible();

  // The integration batch remains honestly in review — never auto-posted.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/imports/${batchId}`);
  await expect(page.getByText(/needs review|ready for approval/i).first()).toBeVisible({
    timeout: 20_000,
  });
});
