import { expect, test, type Browser, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { todayUtc, type IsoDate } from "../shared/dates";
import {
  convexUrl,
  newEmail,
  openAsGm,
  password,
  signInAnonymousGm,
  signUpAccount,
  toastRegion,
  type Gm,
} from "./helpers";

async function seedGroup(name: string) {
  const gm = await signInAnonymousGm();
  await gm.client.mutation(api.groups.rename, { groupId: gm.groupId, name });
  return { gm, link: `/s/${gm.shareToken}` };
}

function dayLabel(date: IsoDate) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function todayTile(page: Page) {
  return page.getByRole("button", { name: new RegExp(`^${dayLabel(todayUtc(Date.now()))}:`) });
}

async function join(page: Page, name: string) {
  await page.getByRole("textbox", { name: /Your name/ }).fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByText("Answering as")).toContainText(name);
}

async function answerToday(page: Page) {
  await todayTile(page).click();
  await expect(todayTile(page)).toHaveAccessibleName(/: Free$/);
}

async function fillAccount(page: Page, email: string) {
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Email").fill(email);
  await sheet.getByLabel("Password").fill(password);
  return sheet;
}

async function logIn(page: Page, email: string) {
  await page.getByRole("banner").getByRole("button", { name: "Log in" }).click();
  const sheet = await fillAccount(page, email);
  await sheet.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "Your account" })).toBeVisible();
}

async function keepByCreatingAccount(page: Page, email: string) {
  await page.getByRole("button", { name: "Keep this group" }).click();
  const sheet = await fillAccount(page, email);
  await sheet.getByRole("button", { name: "Keep group" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("main").getByText("Kept in My groups")).toBeVisible();
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return await context.newPage();
}

async function accountClaiming(gm: Gm, name: string) {
  const email = newEmail();
  const client = new ConvexHttpClient(convexUrl);
  const { tokens } = await client.action(api.auth.signIn, {
    provider: "password",
    params: { email, password, flow: "signUp" },
  });
  client.setAuth(tokens!.token);
  await client.mutation(api.player.join, { shareToken: gm.shareToken, name });
  return email;
}

test("a visitor answers, keeps the Group with a new Account, and opens it as the same Player elsewhere", async ({
  page,
  browser,
}) => {
  const { link } = await seedGroup("Thursday Crew");
  const email = newEmail();

  await page.goto(link);
  await join(page, "Ana");
  await expect(page.getByRole("button", { name: "Keep this group" })).toBeHidden();
  await answerToday(page);
  await expect(page.getByText("Keep this group on all your devices.")).toBeVisible();
  await keepByCreatingAccount(page, email);
  await expect(page.getByRole("button", { name: "Your account" })).toBeVisible();

  const elsewhere = await freshPage(browser);
  await elsewhere.goto(link);
  await expect(elsewhere.getByRole("heading", { name: "Who are you?" })).toBeVisible();
  await logIn(elsewhere, email);
  await expect(elsewhere.getByText("Answering as")).toContainText("Ana");
  await expect(todayTile(elsewhere)).toHaveAccessibleName(/: Free$/);
  await expect(elsewhere.getByRole("main").getByText("Kept in My groups")).toBeVisible();
});

test("an Account that joins a second Group with a new name keeps it at once", async ({
  page,
  browser,
}) => {
  const { link } = await seedGroup("Sunday Table");
  const { email } = await signUpAccount();

  await page.goto(link);
  await logIn(page, email);
  await join(page, "Bea");
  await expect(toastRegion(page)).toContainText("Kept in My groups");
  await expect(page.getByRole("main").getByText("Kept in My groups")).toBeVisible();

  const elsewhere = await freshPage(browser);
  await elsewhere.goto(link);
  await logIn(elsewhere, email);
  await expect(elsewhere.getByText("Answering as")).toContainText("Bea");
});

test("Not you? releases the claim, keeps the Player, and shows Join", async ({ page }) => {
  const { gm, link } = await seedGroup("Friday Crew");
  const { email } = await signUpAccount();

  await page.goto(link);
  await logIn(page, email);
  await join(page, "Cleo");
  await page.getByRole("button", { name: "Not you?" }).click();

  await expect(page.getByRole("heading", { name: "Who are you?" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Cleo" })).toBeVisible();
  const roster = await gm.client.query(api.player.group, { shareToken: gm.shareToken });
  expect(roster?.players.map(({ name }) => name)).toEqual(["Cleo"]);
});

test("another Account's Player cannot be kept", async ({ page }) => {
  const { gm, link } = await seedGroup("Crowded Table");
  await accountClaiming(gm, "Dana");
  const { email } = await signUpAccount();

  await page.goto(link);
  await logIn(page, email);
  await page.getByRole("button", { name: "Dana" }).click();
  await answerToday(page);
  await page.getByRole("button", { name: "Keep this group" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Another account keeps this name. Add yours with a last initial, or ask your GM.",
  );
});

test("an Anonymous GM keeping their own link saves first, then keeps the Player", async ({
  page,
}) => {
  const { gm, link } = await seedGroup("Home Game");
  const email = newEmail();

  await openAsGm(page, gm, link);
  await join(page, "Gus");
  await expect(page.getByRole("banner").getByRole("button", { name: "Log in" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Your account" })).toBeHidden();
  await answerToday(page);
  await page.getByRole("button", { name: "Keep this group" }).click();
  await expect(page.getByRole("dialog")).toContainText("Your own groups move to the account too.");
  const sheet = await fillAccount(page, email);
  await sheet.getByRole("button", { name: "Keep group" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("main").getByText("Kept in My groups")).toBeVisible();

  await page.goto(`/g/${gm.groupId}`);
  await expect(page.getByRole("button", { name: "Your account" })).toBeVisible();
});

test("a signed-out visitor still joins and answers in the same steps", async ({ page }) => {
  const { link } = await seedGroup("Open Table");

  await page.goto(link);
  await expect(page.getByRole("textbox")).toHaveCount(1);
  await join(page, "Eli");
  await expect(page.getByRole("dialog")).toBeHidden();
  await answerToday(page);

  await expect(page.getByRole("banner").getByRole("button", { name: "Log in" })).toBeVisible();
  await expect(page.getByText("Kept in My groups")).toBeHidden();
});

const screenshotDir = process.env.E2E_SCREENSHOTS;

test.describe("screenshots", () => {
  test.skip(!screenshotDir, "Set E2E_SCREENSHOTS to a directory to capture them");

  for (const width of [390, 1440]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${String(width)}px ${colorScheme}`, async ({ browser }) => {
        const { gm, link } = await seedGroup("Thursday Crew");
        await accountClaiming(gm, "Dana");
        const context = await browser.newContext({
          viewport: { width, height: width < 640 ? 844 : 1000 },
          colorScheme,
        });
        const page = await context.newPage();
        await page.addInitScript((groupId) => {
          localStorage.setItem(`next-session.playerHint.${groupId}`, "1");
        }, gm.groupId);
        const shot = (name: string) =>
          page.screenshot({
            path: `${screenshotDir ?? ""}/${name}--${String(width)}--${colorScheme}.png`,
            fullPage: true,
            animations: "disabled",
          });

        await page.goto(link);
        await join(page, "Ana");
        await answerToday(page);
        await shot("keep-this-group");

        await keepByCreatingAccount(page, newEmail());
        await expect(toastRegion(page)).toBeEmpty({ timeout: 10_000 });
        await shot("kept-with-not-you");

        await page.getByRole("button", { name: "Not you?" }).click();
        await page.getByRole("button", { name: "Dana" }).click();
        await answerToday(page);
        await page.getByRole("button", { name: "Keep this group" }).click();
        await expect(page.getByRole("alert")).toBeVisible();
        await shot("player-claimed");
      });
    }
  }
});
