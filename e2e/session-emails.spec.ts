import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openAsGm, signUpAccount } from "./helpers";

test("an Account can save its session email preference on My groups", async ({ page }) => {
  const account = await signUpAccount();
  await openAsGm(page, account, "/me");
  const preference = page.getByRole("switch", {
    name: "Email me when a session is set or cancelled",
  });
  await expect(preference).toBeChecked();
  await preference.click();
  await expect(preference).not.toBeChecked();
  await expect(preference).toBeEnabled();
  await page.reload();
  await expect(preference).not.toBeChecked();
  if (process.env.E2E_SCREENSHOTS) {
    mkdirSync(process.env.E2E_SCREENSHOTS, { recursive: true });
    await page.screenshot({
      path: join(process.env.E2E_SCREENSHOTS, "session-email-preference.png"),
      fullPage: true,
    });
  }
  await preference.click();
  await expect(preference).toBeChecked();
  await expect(preference).toBeEnabled();
  await page.reload();
  await expect(preference).toBeChecked();
});
