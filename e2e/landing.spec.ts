import { expect, test, type Browser, type Page } from "@playwright/test";
import { newEmail, password } from "./helpers";

const shareLinkPattern = /^localhost:5173\/s\/[A-Za-z0-9_-]{10}$/;

async function createLink(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your link" }).click();
  await expect(page.getByText("Your link is ready. Send it to your players.")).toBeVisible();
  const shareLink = (await page.locator("code").textContent()) ?? "";
  const groupPath = (await openGroupLink(page).getAttribute("href")) ?? "";
  return { shareLink, groupPath };
}

function openGroupLink(page: Page) {
  return page.getByRole("link", { name: "Open your group →" });
}

async function saveToNewAccount(page: Page, email: string) {
  await page.getByRole("button", { name: "save it to an account" }).click();
  const sheet = page.getByRole("dialog", { name: /^Keep / });
  await sheet.getByLabel("Email").fill(email);
  await sheet.getByLabel("Password").fill(password);
  await sheet.getByRole("button", { name: "Save group" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Saved to ${email}.` })).toBeFocused();
}

async function seedAccount(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = newEmail();
  const { groupPath } = await createLink(page);
  await saveToNewAccount(page, email);
  await context.close();
  return { email, groupPath };
}

async function openLogIn(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Log in" }).click();
  return page.getByRole("dialog", { name: "Log in" });
}

test("one click puts the link in hand and lands the GM on their Group", async ({ page }) => {
  const { shareLink, groupPath } = await createLink(page);

  expect(shareLink).toMatch(shareLinkPattern);
  expect(groupPath).toMatch(/^\/g\/\w+$/);
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Share via WhatsApp" })).toBeVisible();

  await openGroupLink(page).click();
  await expect(page).toHaveURL(groupPath);

  await page.goto("/");
  await expect(page).toHaveURL(groupPath);
});

test("saving to a new Account keeps the Share Link, and logging in finds the Group", async ({
  page,
  browser,
}) => {
  const email = newEmail();
  const { shareLink, groupPath } = await createLink(page);

  await saveToNewAccount(page, email);
  await expect(page.locator("code")).toHaveText(shareLink);

  const elsewhere = await browser.newContext();
  const otherDevice = await elsewhere.newPage();
  const sheet = await openLogIn(otherDevice);
  await sheet.getByLabel("Email").fill(email);
  await sheet.getByLabel("Password").fill(password);
  await sheet.getByRole("button", { name: "Log in" }).click();
  await expect(otherDevice).toHaveURL(groupPath);
  await elsewhere.close();
});

test("saving into an Account that has older Groups keeps showing the new Group", async ({
  page,
  browser,
}) => {
  const { email, groupPath: olderGroupPath } = await seedAccount(browser);
  const { shareLink, groupPath } = await createLink(page);

  await page.getByRole("button", { name: "save it to an account" }).click();
  const sheet = page.getByRole("dialog", { name: /^Keep / });
  await sheet.getByText("I already have one").click();
  await sheet.getByLabel("Email").fill(email);
  await sheet.getByLabel("Password").fill(password);
  await sheet.getByRole("button", { name: "Log in and save" }).click();

  await expect(page.getByText(`Saved to ${email}.`)).toBeVisible();
  await expect(page.locator("code")).toHaveText(shareLink);
  await expect(openGroupLink(page)).toHaveAttribute("href", groupPath);
  expect(groupPath).not.toBe(olderGroupPath);
});

test("a wrong password says so and keeps the sheet open", async ({ page, browser }) => {
  const { email } = await seedAccount(browser);

  const sheet = await openLogIn(page);
  await sheet.getByLabel("Email").fill(email);
  await sheet.getByLabel("Password").fill("not-the-password");
  await sheet.getByLabel("Password").press("Enter");

  await expect(sheet.getByRole("alert")).toHaveText("Wrong email or password.");
  await expect(sheet.getByLabel("Email")).toHaveValue(email);
  await expect(sheet.getByLabel("Password")).toBeFocused();
});

test.describe("on a dark OS", () => {
  test.use({ colorScheme: "dark" });

  test("a cold load paints a dark canvas", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Create your link" })).toBeVisible();
    const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(canvas).toBe("rgb(15, 14, 19)");
  });
});

const screenshotDir = process.env.E2E_SCREENSHOTS;

test.describe("screenshots", () => {
  test.skip(!screenshotDir, "Set E2E_SCREENSHOTS to a directory to capture them");

  for (const width of [390, 1440]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${width}px ${colorScheme}`, async ({ browser }) => {
        const { email } = await seedAccount(browser);
        const context = await browser.newContext({
          viewport: { width, height: width < 640 ? 844 : 900 },
          colorScheme,
        });
        const page = await context.newPage();
        const shot = (name: string, { sheet = false } = {}) =>
          page.screenshot({
            path: `${screenshotDir}/${name}--${width}--${colorScheme}.png`,
            fullPage: !sheet,
            animations: "disabled",
          });

        await page.goto("/");
        await expect(page.getByRole("button", { name: "Create your link" })).toBeVisible();
        await shot("landing");

        const sheet = await openLogIn(page);
        await sheet.getByLabel("Email").fill(email);
        await sheet.getByLabel("Password").fill("not-the-password");
        await sheet.getByRole("button", { name: "Log in" }).click();
        await expect(sheet.getByRole("alert")).toBeVisible();
        await shot("log-in-error", { sheet: true });
        await page.keyboard.press("Escape");

        await page.getByRole("button", { name: "Create your link" }).click();
        await expect(page.getByText("Your link is ready.", { exact: false })).toBeVisible();
        await shot("link-created");

        await page.getByRole("button", { name: "save it to an account" }).click();
        await expect(page.getByRole("dialog", { name: /^Keep / })).toBeVisible();
        await shot("save-sheet", { sheet: true });
        await context.close();
      });
    }
  }
});
