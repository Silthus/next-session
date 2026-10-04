import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const password = "game-night-2026";
const convexUrl = "http://127.0.0.1:3210";
const shareLinkPattern = /^localhost:5173\/s\/[A-Za-z0-9_-]{10}$/;

function newEmail() {
  return `gm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

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

async function signUpAccountWithoutGroups() {
  const email = newEmail();
  const client = new ConvexHttpClient(convexUrl);
  await client.action(api.auth.signIn, {
    provider: "password",
    params: { email, password, flow: "signUp" },
  });
  return email;
}

async function failFirstFinishSave(page: Page) {
  let failed = false;
  await page.routeWebSocket(/\/api\/.*\/sync/, (client) => {
    const server = client.connectToServer();
    client.onMessage((message) => {
      const text = String(message);
      if (!failed && text.includes('"udfPath":"account:finishSave"')) {
        failed = true;
        const { requestId } = JSON.parse(text) as { requestId: number };
        client.send(
          JSON.stringify({
            type: "MutationResponse",
            requestId,
            success: false,
            result: "Server Error",
            logLines: [],
          }),
        );
      } else server.send(message);
    });
    server.onMessage((message) => client.send(message));
  });
}

async function fillSaveSheet(page: Page, email: string) {
  const sheet = page.getByRole("dialog", { name: /^Keep / });
  await sheet.getByLabel("Email").fill(email);
  await sheet.getByLabel("Password").fill(password);
  await sheet.getByRole("button", { name: "Save group" }).click();
  return sheet;
}

function backdropColor(sheet: Locator) {
  return sheet.evaluate((dialog) => getComputedStyle(dialog, "::backdrop").backgroundColor);
}

async function holdPasswordSignIn(page: Page) {
  const held: string[] = [];
  let release: () => void = () => {};
  await page.routeWebSocket(/\/api\/.*\/sync/, (client) => {
    const server = client.connectToServer();
    client.onMessage((message) => {
      const text = String(message);
      if (text.includes('"udfPath":"auth:signIn"') && text.includes('"provider":"password"')) {
        held.push(text);
      } else server.send(message);
    });
    server.onMessage((message) => client.send(message));
    release = () => held.splice(0).forEach((text) => server.send(text));
  });
  return { heldCount: () => held.length, release: () => release() };
}

async function logInFromElsewhere(browser: Browser, email: string) {
  const elsewhere = await browser.newContext();
  const page = await elsewhere.newPage();
  const noGroupsLines = await countNoGroupsLines(page);
  const sheet = await openLogIn(page);
  await sheet.getByLabel("Email").fill(email);
  await sheet.getByLabel("Password").fill(password);
  await sheet.getByRole("button", { name: "Log in" }).click();
  return { page, noGroupsLines, close: () => elsewhere.close() };
}

async function countNoGroupsLines(page: Page) {
  await page.addInitScript(() => {
    const record = window as unknown as { noGroupsLines: number };
    const seen = new WeakSet<Element>();
    record.noGroupsLines = 0;
    new MutationObserver(() => {
      for (const line of document.querySelectorAll('[role="status"]')) {
        if (seen.has(line) || !line.textContent?.includes("No groups here yet")) continue;
        seen.add(line);
        record.noGroupsLines++;
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { noGroupsLines: number }).noGroupsLines);
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

  const otherDevice = await logInFromElsewhere(browser, email);
  await expect(otherDevice.page).toHaveURL(groupPath);
  expect(await otherDevice.noGroupsLines()).toBe(0);
  await otherDevice.close();
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

test.describe("a Save whose move fails after the sign-in", () => {
  test("goes through on retry from the landing", async ({ page, browser }) => {
    const email = newEmail();
    await failFirstFinishSave(page);
    const { shareLink, groupPath } = await createLink(page);

    await page.getByRole("button", { name: "save it to an account" }).click();
    const sheet = await fillSaveSheet(page, email);
    await expect(sheet.getByRole("alert")).toHaveText("That didn't work. Try again.");
    await expect(sheet.getByText(`Signed in as ${email}.`)).toBeVisible();
    await sheet.getByRole("button", { name: "Finish saving" }).click();

    await expect(page.getByRole("status").filter({ hasText: `Saved to ${email}.` })).toBeFocused();
    await expect(page.locator("code")).toHaveText(shareLink);
    const otherDevice = await logInFromElsewhere(browser, email);
    await expect(otherDevice.page).toHaveURL(groupPath);
    await otherDevice.close();
  });

  test("goes through on retry from the Group header", async ({ page }) => {
    const email = newEmail();
    await failFirstFinishSave(page);
    const { shareLink, groupPath } = await createLink(page);
    await openGroupLink(page).click();
    await expect(page).toHaveURL(groupPath);

    await page.getByRole("button", { name: "Save your group" }).click();
    const sheet = await fillSaveSheet(page, email);
    await expect(sheet.getByRole("alert")).toHaveText("That didn't work. Try again.");
    await sheet.getByRole("button", { name: "Finish saving" }).click();

    await expect(page.getByRole("status")).toHaveText("Saved. Open it anywhere with your account.");
    await expect(page).toHaveURL(new RegExp(`^[^?]*${groupPath}`));
    await expect(page.getByText(shareLink.replace(/^localhost:5173/, ""))).toBeVisible();
  });
});

test("pressing Escape again and again mid-Save keeps the sheet up until it is done", async ({
  page,
}) => {
  const email = newEmail();
  const signIn = await holdPasswordSignIn(page);
  await createLink(page);
  await page.getByRole("button", { name: "save it to an account" }).click();
  const sheet = await fillSaveSheet(page, email);
  await expect.poll(signIn.heldCount).toBe(1);

  for (let press = 1; press <= 3; press++) {
    await page.keyboard.press("Escape");
    await expect(sheet.getByRole("button", { name: "Saving…" })).toBeVisible();
  }
  expect(await sheet.evaluate((dialog) => (dialog as HTMLDialogElement).open)).toBe(true);
  await expect(sheet.getByLabel("Email")).toHaveValue(email);

  signIn.release();
  await expect(page.getByRole("status").filter({ hasText: `Saved to ${email}.` })).toBeFocused();
  await expect(sheet).toBeHidden();
});

test("logging in to an Account without Groups names it and points to the first link", async ({
  page,
}) => {
  const email = await signUpAccountWithoutGroups();
  const noGroupsLines = await countNoGroupsLines(page);

  const sheet = await openLogIn(page);
  await expect(sheet.getByLabel("Email")).toBeFocused();
  await sheet.getByLabel("Email").fill(email);
  await sheet.getByLabel("Password").fill(password);
  await sheet.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("button", { name: "Log in" })).toBeHidden();
  await expect(page.getByRole("status")).toHaveText(
    `Signed in as ${email}. No groups here yet, so create your first link.`,
  );
  await expect(page.getByRole("status")).toBeFocused();
  await expect(page.getByRole("button", { name: "Create your link" })).toBeVisible();
  expect(await noGroupsLines()).toBe(1);
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

  test("an open sheet dims the page behind it", async ({ page }) => {
    expect(await backdropColor(await openLogIn(page))).toBe("oklab(0 0 0 / 0.7)");
  });
});

test("an open sheet dims the page behind it in light mode", async ({ page }) => {
  expect(await backdropColor(await openLogIn(page))).toBe("oklab(0 0 0 / 0.4)");
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
        const saveSheet = page.getByRole("dialog", { name: /^Keep / });
        await expect(saveSheet.getByRole("button", { name: "Close" })).toBeVisible();
        await shot("sheet", { sheet: true });
        await saveSheet.getByRole("button", { name: "Close" }).click();

        await openGroupLink(page).click();
        await expect(page.getByRole("heading", { level: 1 }).getByRole("button")).toBeVisible();
        await expect(page.getByRole("link", { name: "Share via WhatsApp" })).toBeVisible();
        await shot("share-compact");
        await context.close();
      });
    }
  }
});
