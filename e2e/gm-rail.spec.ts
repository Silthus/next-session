import { expect, test, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { Answer } from "../shared/answers";
import { addMonths, monthOf, todayUtc } from "../shared/dates";

const convexUrl = "http://127.0.0.1:3210";
const authStorageSuffix = convexUrl.replace(/[^a-zA-Z0-9]/g, "");

type Tokens = { token: string; refreshToken: string };
type Gm = { tokens: Tokens; client: ConvexHttpClient; groupId: Id<"groups">; shareToken: string };

async function signInAnonymousGm(): Promise<Gm> {
  const client = new ConvexHttpClient(convexUrl);
  const { tokens } = await client.action(api.auth.signIn, { provider: "anonymous" });
  if (!tokens) throw new Error("The anonymous sign-in returned no tokens");
  client.setAuth(tokens.token);
  const [group] = await client.query(api.groups.mine, {});
  if (!group) throw new Error("The anonymous sign-in made no Group");
  return { tokens, client, groupId: group.id, shareToken: await shareTokenOf(client, group.id) };
}

async function shareTokenOf(client: ConvexHttpClient, groupId: Id<"groups">) {
  const view = await client.query(api.groups.get, { groupId });
  if (!view) throw new Error("The GM cannot read their Group");
  return view.shareToken;
}

async function seedPlayer(gm: Gm, name: string, answers: Record<string, Answer> = {}) {
  const visitor = new ConvexHttpClient(convexUrl);
  const playerId = await visitor.mutation(api.player.join, { shareToken: gm.shareToken, name });
  for (const [date, answer] of Object.entries(answers)) {
    await visitor.mutation(api.player.answer, {
      shareToken: gm.shareToken,
      playerId,
      date,
      answer,
    });
  }
}

async function openAsGm(page: Page, gm: Gm, path: string) {
  await page.goto("/terms");
  await page.evaluate(
    ([suffix, tokens]) => {
      localStorage.setItem(`__convexAuthJWT_${suffix}`, tokens.token);
      localStorage.setItem(`__convexAuthRefreshToken_${suffix}`, tokens.refreshToken);
    },
    [authStorageSuffix, gm.tokens] as const,
  );
  await page.goto(path);
}

async function rosterNames(gm: Gm) {
  const schedule = await gm.client.query(api.schedule.month, {
    groupId: gm.groupId,
    month: nextMonth,
  });
  return schedule?.players.map((player) => player.name) ?? [];
}

let nextMonth = addMonths(monthOf(todayUtc(Date.now())), 1);

test.beforeEach(() => {
  nextMonth = addMonths(monthOf(todayUtc(Date.now())), 1);
});

const night = (day: number) => `${nextMonth}-${String(day).padStart(2, "0")}`;

async function seedCrew(gm: Gm) {
  await seedPlayer(gm, "Ana", { [night(5)]: "free", [night(6)]: "free", [night(7)]: "maybe" });
  await seedPlayer(gm, "Ben", { [night(5)]: "free", [night(6)]: "maybe", [night(7)]: "free" });
  await seedPlayer(gm, "Chiara", { [night(5)]: "free", [night(6)]: "busy" });
}

const playersCard = (page: Page) => page.getByRole("region", { name: /^Players/ });
const switcher = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1 }).getByRole("button", { name });

test("the GM copies, rotates, and undoes the Share Link from the rail", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const gm = await signInAnonymousGm();
  await openAsGm(page, gm, `/g/${gm.groupId}`);

  const rail = page.getByRole("complementary", { name: "Group overview" });
  await expect(rail.getByText(`/s/${gm.shareToken}`)).toBeVisible();
  await rail.getByRole("button", { name: "Copy" }).click();
  await expect(rail.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    `/s/${gm.shareToken}`,
  );

  await rail.getByRole("button", { name: "Rotate" }).focus();
  await page.keyboard.press("Enter");
  const toast = page.getByRole("status");
  await expect(toast).toContainText("Link rotated. Old links stopped working.");
  await expect.poll(() => shareTokenOf(gm.client, gm.groupId)).not.toBe(gm.shareToken);
  const rotated = await shareTokenOf(gm.client, gm.groupId);
  await expect(rail.getByText(`/s/${rotated}`)).toBeVisible();
  await expect(rail.getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Rotate" })).toBeFocused();

  await toast.getByRole("button", { name: "Undo" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("The old link works again.");
  await expect(page.locator("[data-month-heading]")).toBeFocused();
  await expect(rail.getByText(`/s/${gm.shareToken}`)).toBeVisible();
  await expect.poll(() => shareTokenOf(gm.client, gm.groupId)).toBe(gm.shareToken);
});

test("the newest action owns the only toast", async ({ page }) => {
  const gm = await signInAnonymousGm();
  await seedCrew(gm);
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}&day=${night(5)}`);
  const rail = page.getByRole("complementary", { name: "Group overview" });

  await rail.getByRole("button", { name: "Rotate" }).click();
  await expect(page.getByRole("status")).toContainText("Link rotated.");
  await rail.getByRole("button", { name: "Schedule session" }).click();
  await expect(page.getByRole("status")).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText("Players see it on the link.");

  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(rail.getByRole("button", { name: "Schedule session" })).toBeVisible();
  await expect.poll(() => shareTokenOf(gm.client, gm.groupId)).not.toBe(gm.shareToken);
});

test("the GM adds, renames, and removes Players", async ({ page }) => {
  const gm = await signInAnonymousGm();
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

  const players = playersCard(page);
  await expect(players.getByText("Players add themselves when they open your link.")).toBeVisible();
  await players.getByRole("textbox", { name: "Player name" }).fill("Ana");
  await page.keyboard.press("Enter");
  await expect(players.getByRole("listitem")).toHaveText([/Ana/]);
  await expect.poll(() => rosterNames(gm)).toEqual(["Ana"]);

  await players.getByRole("button", { name: "Add player" }).click();
  await players.getByRole("textbox", { name: "Player name" }).fill("ana");
  await page.keyboard.press("Enter");
  await expect(players.getByRole("alert")).toHaveText("That name is already on the list.");
  await players.getByRole("textbox", { name: "Player name" }).fill("Ben");
  await page.keyboard.press("Enter");
  await expect(players.getByRole("listitem")).toHaveText([/Ana/, /Ben/]);

  await page.goto(`/g/${gm.groupId}?month=${nextMonth}&day=${night(5)}`);
  await players.getByRole("button", { name: "More for Ben" }).click();
  await players.getByRole("button", { name: "Rename" }).click();
  await players
    .getByRole("textbox", { name: "New name for Ben" })
    .dispatchEvent("keydown", { key: "Escape", isComposing: true, bubbles: true });
  await expect(page.getByRole("region", { name: /, \w+ 5$/ })).toBeVisible();
  await players.getByRole("textbox", { name: "New name for Ben" }).fill("Benedikt");
  await page.keyboard.press("Enter");
  await expect(players.getByRole("listitem")).toHaveText([/Ana/, /Benedikt/]);

  await players.getByRole("button", { name: "More for Ana" }).click();
  await players.getByRole("button", { name: "Remove" }).click();
  await players.getByRole("button", { name: "Remove Ana" }).click();
  await expect(players.getByRole("listitem")).toHaveText([/Benedikt/]);
  await expect.poll(() => rosterNames(gm)).toEqual(["Benedikt"]);
});

test("Best Nights and Sessions open their day", async ({ page }) => {
  const gm = await signInAnonymousGm();
  await seedCrew(gm);
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

  const bestNights = page.getByRole("region", { name: "Best nights" });
  await expect(bestNights.getByRole("listitem")).toHaveText([
    /^1.*Everyone is free/,
    /^2.*1 of 3 free, 1 maybe/,
  ]);
  await bestNights.getByRole("button", { name: /Everyone is free/ }).click();
  await expect(page).toHaveURL(new RegExp(`day=${night(5)}`));
  const dayPanel = page.getByRole("region", { name: /, \w+ 5$/ });
  await dayPanel.getByRole("button", { name: "Schedule session" }).click();

  const sessions = page.getByRole("region", { name: "Sessions" });
  await expect(sessions.getByRole("button", { name: /5/ })).toBeVisible();
  await dayPanel.getByRole("button", { name: "Overview" }).click();
  await page.goto(`/g/${gm.groupId}`);
  await sessions.getByRole("button", { name: /5/ }).click();
  await expect(page).toHaveURL(new RegExp(`month=${nextMonth}&day=${night(5)}`));
  await expect(page.getByRole("region", { name: /, \w+ 5$/ })).toBeVisible();
});

test("the switcher opens, makes, renames and deletes Groups, and the landing returns to the last one", async ({
  page,
}) => {
  const gm = await signInAnonymousGm();
  const otherId = await gm.client.mutation(api.groups.create, {});
  await gm.client.mutation(api.groups.rename, { groupId: otherId, name: "Poker night" });
  await seedPlayer(gm, "Ana");
  await openAsGm(page, gm, `/g/${gm.groupId}`);

  await switcher(page, "My group").click();
  await expect(page.getByRole("link", { name: /^(My group|Poker night)/ })).toHaveText([
    "My group1",
    "Poker night0",
  ]);
  await page.getByRole("link", { name: "Poker night, 0 players" }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${otherId}$`));
  await expect(switcher(page, "Poker night")).toBeVisible();

  await page.goto("/");
  await expect(page).toHaveURL(new RegExp(`/g/${otherId}$`));

  await switcher(page, "Poker night").click();
  await page.getByRole("button", { name: "Rename group" }).click();
  await page.getByRole("textbox", { name: "Group name" }).fill("Thursday Crew");
  await page.keyboard.press("Enter");
  await expect(switcher(page, "Thursday Crew")).toBeFocused();

  await switcher(page, "Thursday Crew").click();
  await page.getByRole("button", { name: "New group" }).click();
  await expect(switcher(page, "My group")).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(`/g/(${otherId}|${gm.groupId})$`));
  expect(await gm.client.query(api.groups.mine, {})).toHaveLength(3);

  await switcher(page, "My group").click();
  await page.getByRole("button", { name: "Delete group" }).click();
  await expect(page.getByRole("group", { name: "Delete My group?" })).toContainText(
    "the player link stops working.",
  );
  await page.getByRole("button", { name: "Delete My group" }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${gm.groupId}$`));
  await expect.poll(async () => (await gm.client.query(api.groups.mine, {})).length).toBe(2);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/g/${otherId}$`));
  await expect(switcher(page, "Thursday Crew")).toBeVisible();
});

test("an Anonymous GM is nudged to save once a Player joins, until Later", async ({ page }) => {
  const gm = await signInAnonymousGm();
  await openAsGm(page, gm, `/g/${gm.groupId}`);
  const nudge = page.getByRole("region", { name: "Save your group" });
  await expect(switcher(page, "My group")).toBeVisible();
  await expect(nudge).toBeHidden();

  await seedPlayer(gm, "Ana");
  await seedPlayer(gm, "Ben");
  await page.reload();
  await expect(nudge).toContainText("Ana and Ben joined.");
  await nudge.getByRole("button", { name: "Save group" }).click();
  await expect(page.getByRole("dialog", { name: "Keep My group" })).toBeVisible();
  await page.keyboard.press("Escape");

  await nudge.getByRole("button", { name: "Later" }).click();
  await expect(nudge).toBeHidden();
  await expect(page.locator("[data-month-heading]")).toBeFocused();
  await page.reload();
  await expect(switcher(page, "My group")).toBeVisible();
  await expect(nudge).toBeHidden();
  await expect(page.getByRole("button", { name: "Save your group" })).toBeVisible();
});

test("on a phone the rail sits under the calendar behind a segmented control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const gm = await signInAnonymousGm();
  await seedCrew(gm);
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

  await expect(page.getByText(`/s/${gm.shareToken}`)).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Group overview" });
  await expect(tabs.getByRole("tab", { selected: true })).toHaveText("Best nights");
  await expect(page.getByRole("region", { name: "Best nights" })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Players/ })).toBeHidden();

  await tabs.getByRole("tab", { name: "Players" }).click();
  await expect(playersCard(page).getByRole("listitem")).toHaveText([/Ana/, /Ben/, /Chiara/]);
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Sessions" })).toBeFocused();
  await expect(page.getByRole("region", { name: "Sessions" })).toBeVisible();
});

const password = "game-night-2026";

async function signUpAccountWithGroup() {
  const email = `gm-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const client = new ConvexHttpClient(convexUrl);
  const { tokens } = await client.action(api.auth.signIn, {
    provider: "password",
    params: { email, password, flow: "signUp" },
  });
  if (!tokens) throw new Error("The sign-up returned no tokens");
  client.setAuth(tokens.token);
  await client.mutation(api.groups.create, {});
  return { email, client };
}

test("an Anonymous GM saves into an Account from the header and stays on the Group", async ({
  page,
}) => {
  const account = await signUpAccountWithGroup();
  const gm = await signInAnonymousGm();
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}&day=${night(5)}`);
  const dayPanel = page.getByRole("region", { name: /, \w+ 5$/ });

  await page.getByRole("button", { name: "Save your group" }).click();
  const sheet = page.getByRole("dialog", { name: "Keep My group" });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(dayPanel).toBeVisible();

  await page.getByRole("button", { name: "Save your group" }).click();
  await sheet.getByText("I already have one").click();
  await sheet.getByLabel("Email").fill(account.email);
  await sheet.getByLabel("Password").fill(password);
  await sheet.getByRole("button", { name: "Log in and save" }).click();

  await expect(page.getByRole("status")).toHaveText("Saved. Open it anywhere with your account.");
  await expect(page).toHaveURL(new RegExp(`/g/${gm.groupId}\\?`));
  await expect(page.getByRole("button", { name: "Your account" })).toBeVisible();
  await expect(page.locator("[data-month-heading]")).toBeFocused();
  await expect(page.getByText(`/s/${gm.shareToken}`)).toBeVisible();
  await expect(dayPanel).toBeVisible();
  await expect
    .poll(async () => (await account.client.query(api.groups.mine, {})).map((group) => group.id))
    .toContain(gm.groupId);
});

test("on a phone the toast clears the open day sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const gm = await signInAnonymousGm();
  await seedCrew(gm);
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}&day=${night(5)}`);

  const sheet = page.getByRole("region", { name: /, \w+ 5$/ });
  await sheet.getByRole("button", { name: "Schedule session" }).click();
  const toast = page.getByRole("status");
  await expect(toast).toContainText("Players see it on the link.");
  const [toastBox, sheetBox] = await Promise.all([toast.boundingBox(), sheet.boundingBox()]);
  expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(sheetBox!.y);
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(sheet.getByRole("button", { name: "Schedule session" })).toBeVisible();
});

test("deleting the last Group of an Anonymous GM returns to the landing", async ({ page }) => {
  const gm = await signInAnonymousGm();
  await openAsGm(page, gm, `/g/${gm.groupId}`);
  await switcher(page, "My group").click();
  await page.getByRole("button", { name: "Delete group" }).click();
  await page.getByRole("button", { name: "Delete My group" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Create your link" })).toBeVisible();
});

const screenshotDir = process.env.E2E_SCREENSHOTS;

test.describe("screenshots", () => {
  test.skip(!screenshotDir, "Set E2E_SCREENSHOTS to a directory to capture them");

  for (const width of [390, 1440]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${String(width)}px ${colorScheme}`, async ({ browser }) => {
        const gm = await signInAnonymousGm();
        await gm.client.mutation(api.groups.create, {});
        await gm.client.mutation(api.groups.rename, { groupId: gm.groupId, name: "Thursday Crew" });
        await seedCrew(gm);
        await seedPlayer(gm, "Dev", { [night(5)]: "free", [night(7)]: "free" });
        await gm.client.mutation(api.sessions.schedule, { groupId: gm.groupId, date: night(12) });

        const context = await browser.newContext({
          viewport: { width, height: width < 640 ? 844 : 1000 },
          colorScheme,
        });
        const page = await context.newPage();
        const shot = (name: string, fullPage = true) =>
          page.screenshot({
            path: `${screenshotDir ?? ""}/${name}--${String(width)}--${colorScheme}.png`,
            fullPage,
            animations: "disabled",
          });

        await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);
        const nudge = page.getByRole("region", { name: "Save your group" });
        await expect(nudge).toContainText("Ana, Ben and 2 more joined.");
        await shot("save-nudge", false);

        await nudge.getByRole("button", { name: "Later" }).click();
        if (width < 640) {
          await page.getByRole("tab", { name: "Players" }).click();
          await shot("phone-segmented-control");
          await page.getByRole("tab", { name: "Best nights" }).click();
        }
        await shot("rail");

        await page.getByRole("button", { name: "Rotate" }).first().click();
        await expect(page.getByRole("status")).toContainText("Link rotated.");
        await shot("rotate-undo", false);

        await switcher(page, "Thursday Crew").click();
        await expect(page.getByRole("link", { name: /My group/ })).toBeVisible();
        await shot("switcher", false);
        await context.close();
      });
    }
  }
});
