import { expect, test, type Page } from "@playwright/test";
import { TIPS_CONSENT_WORDING } from "../shared/tips";
import { newEmail, password } from "./helpers";

const yes = { name: "Yes, send me the tips" };

async function openSaveSheet(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your link" }).click();
  await page.getByRole("button", { name: "save it to an account" }).click();
  const sheet = page.getByRole("dialog", { name: /^Keep / });
  await expect(sheet.getByLabel("Email", { exact: true })).toBeVisible();
  return sheet;
}

test("saves to a new Account that asked for Tips", async ({ page }) => {
  const email = newEmail();
  const sheet = await openSaveSheet(page);
  const tipsBox = sheet.getByRole("checkbox", { name: TIPS_CONSENT_WORDING });

  await expect(tipsBox).not.toBeChecked();
  await sheet.getByLabel("Email", { exact: true }).fill(email);
  await sheet.getByLabel("Password").fill(password);
  await tipsBox.check();
  await sheet.getByRole("button", { name: "Save group" }).click();

  await expect(page.getByRole("status").filter({ hasText: `Saved to ${email}.` })).toBeFocused();
});

test("/tips takes the code out of the address bar and confirms only on the press", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("websocket", (socket) =>
    socket.on("framesent", ({ payload }) => {
      if (/"type":"(Mutation|Action)"/.test(String(payload))) calls.push(String(payload));
    }),
  );

  await page.goto("/tips?confirm=not-a-real-code");

  await expect(page.getByRole("button", yes)).toBeVisible();
  await expect(page).toHaveURL(/\/tips$/);
  expect(calls).toEqual([]);

  await page.getByRole("button", yes).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "This link has expired" }),
  ).toBeFocused();
  await expect(page.getByText("That's fine, you'll just get no tips.")).toBeVisible();
  expect(calls).toEqual([expect.stringContaining('"udfPath":"account:confirmTips"')]);
});

const screenshotDir = process.env.E2E_SCREENSHOTS;

test.describe("screenshots", () => {
  test.skip(!screenshotDir, "Set E2E_SCREENSHOTS to a directory to capture them");

  for (const width of [390, 1440]) {
    for (const colorScheme of ["light", "dark"] as const) {
      const shot = (page: Page, name: string) =>
        page.screenshot({
          path: `${screenshotDir ?? ""}/${name}--${String(width)}--${colorScheme}.png`,
        });

      test(`the Tips box and /tips at ${String(width)} px, ${colorScheme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });

        const sheet = await openSaveSheet(page);
        await sheet.getByRole("checkbox", { name: TIPS_CONSENT_WORDING }).check();
        await shot(page, "save-sheet-tips-box");

        await page.goto("/tips?confirm=not-a-real-code");
        await expect(page.getByRole("button", yes)).toBeVisible();
        await shot(page, "tips-page");
        await page.getByRole("button", yes).click();
        await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
        await shot(page, "tips-page-expired");
      });
    }
  }
});
