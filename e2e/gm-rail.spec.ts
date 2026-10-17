import { expect, test, type Page } from "@playwright/test";
import { api } from "../convex/_generated/api";
import type { Answer } from "../shared/answers";
import { addMonths, monthOf, todayUtc } from "../shared/dates";
import {
  openAsGm,
  password,
  seedPlayer,
  shareTokenOf,
  signInAnonymousGm,
  signUpAccountWithGroup,
  toastRegion,
  type Gm,
} from "./helpers";

async function rosterNames(gm: Gm) {
  const schedule = await gm.client.query(api.schedule.month, {
    groupId: gm.groupId,
    month: nextMonth,
  });
  return schedule?.players.map((player) => player.name) ?? [];
}

async function sessionDates(gm: Gm) {
  const schedule = await gm.client.query(api.schedule.month, {
    groupId: gm.groupId,
    month: nextMonth,
  });
  return schedule?.sessions.map((session) => session.date) ?? [];
}

let nextMonth = addMonths(monthOf(todayUtc(Date.now())), 1);

test.beforeEach(() => {
  nextMonth = addMonths(monthOf(todayUtc(Date.now())), 1);
});

const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

const night = (day: number) => `${nextMonth}-${String(day).padStart(2, "0")}`;

async function seedCrew(gm: Gm) {
  await seedPlayer(gm, "Ana", { [night(5)]: "free", [night(6)]: "free", [night(7)]: "maybe" });
  await seedPlayer(gm, "Ben", { [night(5)]: "free", [night(6)]: "maybe", [night(7)]: "free" });
  await seedPlayer(gm, "Chiara", { [night(5)]: "free", [night(6)]: "busy" });
}

const playersCard = (page: Page) => page.getByRole("region", { name: /^Players/ });
const switcher = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1 }).getByRole("button", { name });

test("the GM copies, rotates, and undoes the Share Link from the top bar", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const gm = await signInAnonymousGm();
  await openAsGm(page, gm, `/g/${gm.groupId}`);

  const topBar = page.getByRole("banner");
  const copyButton = topBar.getByRole("button", { name: "Copy player link" });
  await expect(topBar.getByText(`/s/${gm.shareToken}`)).toBeVisible();
  await copyButton.click();
  await expect(copyButton).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    `/s/${gm.shareToken}`,
  );

  await topBar.getByRole("button", { name: "Share player link" }).click();
  await topBar.getByRole("button", { name: "Rotate" }).focus();
  await page.keyboard.press("Enter");
  const toast = toastRegion(page);
  await expect(toast).toContainText("Link rotated. Old links stopped working.");
  await expect.poll(() => shareTokenOf(gm.client, gm.groupId)).not.toBe(gm.shareToken);
  const rotated = await shareTokenOf(gm.client, gm.groupId);
  await expect(topBar.getByText(`/s/${rotated}`).first()).toBeVisible();
  await expect(topBar.getByRole("button", { name: "Rotate" })).toBeFocused();

  await toast.getByRole("button", { name: "Undo" }).focus();
  await page.keyboard.press("Enter");
  await expect(toast).toContainText("The old link works again.");
  await expect(page.locator("[data-month-heading]")).toBeFocused();
  await expect(topBar.getByText(`/s/${gm.shareToken}`)).toBeVisible();
  await expect.poll(() => shareTokenOf(gm.client, gm.groupId)).toBe(gm.shareToken);
});

test("the GM shares the month they are looking at, and players open on it", async ({
  page,
  browser,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const gm = await signInAnonymousGm();
  await seedPlayer(gm, "Ana");
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

  const topBar = page.getByRole("banner");
  await topBar.getByRole("button", { name: "Copy player link" }).click();
  await expect(topBar.getByRole("button", { name: "Copy player link" })).toHaveText("Copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(`${new URL(page.url()).origin}/s/${gm.shareToken}?month=${nextMonth}`);
  await topBar.getByRole("button", { name: "Share player link" }).click();
  await expect(topBar.getByRole("link", { name: "Share via WhatsApp" })).toHaveAttribute(
    "href",
    `https://wa.me/?text=${encodeURIComponent(`Help me find our next game night. Tap the days you can play, it takes 30 seconds: ${copied}`)}`,
  );

  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();
  await player.goto(copied);
  await player.getByRole("button", { name: "Ana", exact: true }).click();
  await expect(
    player.getByRole("heading", { level: 2, name: new RegExp(`^${monthName(nextMonth)}`) }),
  ).toBeVisible();
  await playerContext.close();
});

test("the newest action owns the only toast", async ({ page }) => {
  const gm = await signInAnonymousGm();
  await seedCrew(gm);
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);
  const toast = toastRegion(page);

  await page.getByRole("button", { name: "Share player link" }).click();
  await page.getByRole("button", { name: "Rotate" }).click();
  await expect(toast).toContainText("Link rotated.");
  await page.getByRole("button", { name: /, \w+ 5: / }).click();
  const dayPanel = page.getByRole("region", { name: /, \w+ 5$/ });
  await dayPanel.getByRole("button", { name: "Schedule session" }).click();
  await expect(toast).toContainText("Players see it on the link.");
  await expect(toast).not.toContainText("Link rotated.");

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(dayPanel.getByRole("button", { name: "Schedule session" })).toBeVisible();
  await expect.poll(() => shareTokenOf(gm.client, gm.groupId)).not.toBe(gm.shareToken);
});

test("the open night floats beside its cell and closes on a click elsewhere", async ({ page }) => {
  const gm = await signInAnonymousGm();
  await seedCrew(gm);
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

  const cell = page.getByRole("button", { name: /, \w+ 6: / });
  await cell.click();
  const dayPanel = page.getByRole("region", { name: /, \w+ 6$/ });
  const [cellBox, panelBox] = await Promise.all([cell.boundingBox(), dayPanel.boundingBox()]);
  const besideCell =
    panelBox!.x >= cellBox!.x + cellBox!.width || panelBox!.x + panelBox!.width <= cellBox!.x;
  expect(besideCell).toBe(true);
  await expect(page.getByRole("region", { name: "Sessions" })).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(dayPanel.getByRole("button", { name: "Close" })).toBeFocused();

  await page.locator("[data-month-heading]").click();
  await expect(dayPanel).toBeHidden();
  await expect(page).not.toHaveURL(/day=/);
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

  await players.getByRole("textbox", { name: "Player name" }).fill("ana");
  await page.keyboard.press("Enter");
  await expect(players.getByRole("alert")).toHaveText("That name is already on the list.");
  await players.getByRole("textbox", { name: "Player name" }).fill("Ben");
  await page.keyboard.press("Enter");
  await expect(players.getByRole("listitem")).toHaveText([/Ana/, /Ben/]);

  await page.goto(`/g/${gm.groupId}?month=${nextMonth}&day=${night(5)}`);
  await players.getByRole("button", { name: "More for Ben" }).press("Enter");
  await players.getByRole("button", { name: "Rename" }).press("Enter");
  for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
    await players
      .getByRole("textbox", { name: "New name for Ben" })
      .dispatchEvent("keydown", { key: "Escape", bubbles: true, ...composition });
    await expect(players.getByRole("textbox", { name: "New name for Ben" })).toBeFocused();
    await expect(page.getByRole("region", { name: /, \w+ 5$/ })).toBeVisible();
  }
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
  await dayPanel.getByRole("button", { name: "Close" }).click();
  await expect.poll(() => sessionDates(gm)).toEqual([night(5)]);
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

test("on a phone the calendar starts under the top bar, the link one tap away", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 390, height: 844 });
  const gm = await signInAnonymousGm();
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

  const calendar = page.locator("section").filter({ has: page.locator("[data-month-heading]") });
  await expect(calendar).toBeVisible();
  const [headerBox, calendarBox] = await Promise.all([
    page.locator("header").boundingBox(),
    calendar.boundingBox(),
  ]);
  expect(calendarBox!.y - (headerBox!.y + headerBox!.height)).toBeLessThanOrEqual(16);
  await expect(page.getByText(`/s/${gm.shareToken}`)).toBeHidden();

  await page.getByRole("button", { name: "Copy player link" }).click();
  await expect(toastRegion(page)).toContainText("Link copied. Send it to your players.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${new URL(page.url()).origin}/s/${gm.shareToken}?month=${nextMonth}`,
  );

  await page.getByRole("button", { name: "Share player link" }).click();
  await expect(page.getByText(`/s/${gm.shareToken}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Share via WhatsApp" })).toBeVisible();
  await page.getByRole("button", { name: "Rotate" }).click();
  await expect(toastRegion(page)).toContainText("Link rotated. Old links stopped working.");
  await expect.poll(() => shareTokenOf(gm.client, gm.groupId)).not.toBe(gm.shareToken);
  await expect(page.getByText(`/s/${await shareTokenOf(gm.client, gm.groupId)}`)).toBeVisible();
});

test("on a phone the rail sits under the calendar behind a segmented control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const gm = await signInAnonymousGm();
  await seedCrew(gm);
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

  await expect(page.getByRole("button", { name: "Copy player link" })).toBeVisible();
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

for (const width of [390, 1440]) {
  test(`${String(width)}px: the GM types three Players in a row with Enter only`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const gm = await signInAnonymousGm();
    await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

    const field = playersCard(page).getByRole("textbox", { name: "Player name" });
    await field.click();
    const added: RegExp[] = [];
    for (const name of ["Ana", "Ben", "Chiara"]) {
      await page.keyboard.type(name);
      await page.keyboard.press("Enter");
      added.push(new RegExp(name));
      await expect(playersCard(page).getByRole("listitem")).toHaveText(added);
      await expect(field).toBeFocused();
      await expect(field).toHaveValue("");
    }
    await expect.poll(() => rosterNames(gm)).toEqual(["Ana", "Ben", "Chiara"]);
  });
}

test.describe("phone Add tap", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("the GM taps Add for consecutive names without blurring the field", async ({ page }) => {
    const gm = await signInAnonymousGm();
    await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);
    const card = playersCard(page);
    const field = card.getByRole("textbox", { name: "Player name" });
    await field.tap();
    await field.evaluate((input) => {
      input.dataset.blurred = "false";
      input.addEventListener("blur", () => {
        input.dataset.blurred = "true";
      });
    });
    for (const [index, name] of ["Ana", "Ben", "Chiara"].entries()) {
      await page.keyboard.type(name);
      await card.getByRole("button", { name: "Add", exact: true }).tap();
      await expect(card.getByRole("listitem")).toHaveCount(index + 1);
      await expect(field).toBeFocused();
      await expect(field).toHaveValue("");
      await expect(field).toHaveAttribute("data-blurred", "false");
    }
  });
});

test("on a phone a fresh Group opens on Players, so the GM adds one under the calendar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const gm = await signInAnonymousGm();
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

  const tabs = page.getByRole("tablist", { name: "Group overview" });
  await expect(tabs.getByRole("tab", { selected: true })).toHaveText("Players");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await playersCard(page).getByRole("textbox", { name: "Player name" }).fill("Ana");
  await page.keyboard.press("Enter");
  await expect(playersCard(page).getByRole("listitem")).toHaveText([/Ana/]);
  await expect(tabs.getByRole("tab", { selected: true })).toHaveText("Players");
});

test("on a phone Add player stays in reach under the calendar whatever tab is open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const gm = await signInAnonymousGm();
  await seedCrew(gm);
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);
  await page
    .getByRole("region", { name: "Save your group" })
    .getByRole("button", { name: "Later" })
    .click();

  const tabs = page.getByRole("tablist", { name: "Group overview" });
  const addPlayer = page.getByRole("button", { name: "Add player" });
  await expect(tabs.getByRole("tab", { selected: true })).toHaveText("Best nights");
  await expect(addPlayer).toBeInViewport();

  await addPlayer.click();
  await expect(tabs.getByRole("tab", { selected: true })).toHaveText("Players");
  const field = playersCard(page).getByRole("textbox", { name: "Player name" });
  await expect(field).toBeFocused();
  await expect(field).toBeInViewport();
  await field.fill("Dev");
  await page.keyboard.press("Enter");
  await expect(playersCard(page).getByRole("listitem")).toHaveText([/Ana/, /Ben/, /Chiara/, /Dev/]);

  await tabs.getByRole("tab", { name: "Sessions" }).click();
  await page.getByRole("button", { name: "Add player" }).click();
  await expect(playersCard(page).getByRole("textbox", { name: "Player name" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("a Player who joins with a new name stays on the Roster as grey bars until the GM removes them", async ({
  page,
}) => {
  const gm = await signInAnonymousGm();
  await seedPlayer(gm, "Dana");
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

  const notAnswered = page.getByRole("button", { name: /, \w+ 5: .*1 not answered$/ });
  await expect(playersCard(page).getByRole("listitem")).toHaveText([/Dana/]);
  await expect(notAnswered.locator('[data-bar="unanswered"]')).toHaveCount(1);
  await page.reload();
  await expect(playersCard(page).getByRole("listitem")).toHaveText([/Dana/]);
  await expect.poll(() => rosterNames(gm)).toEqual(["Dana"]);

  await playersCard(page).getByRole("button", { name: "More for Dana" }).click();
  await playersCard(page).getByRole("button", { name: "Remove" }).click();
  await playersCard(page).getByRole("button", { name: "Remove Dana" }).click();
  await expect(playersCard(page).getByRole("listitem")).toHaveCount(0);
  await expect(notAnswered).toHaveCount(0);
  await expect.poll(() => rosterNames(gm)).toEqual([]);
});

test("an Anonymous GM saves into an Account from the header, stays on the Group, and its own Share Link leads back to it", async ({
  page,
}) => {
  const account = await signUpAccountWithGroup();
  const gm = await signInAnonymousGm();
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}&day=${night(5)}`);
  const dayPanel = page.getByRole("region", { name: /, \w+ 5$/ });

  await page.getByRole("button", { name: "Save your group" }).press("Enter");
  const sheet = page.getByRole("dialog", { name: "Keep My group" });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(dayPanel).toBeVisible();

  await page.getByRole("button", { name: "Save your group" }).press("Enter");
  await sheet.getByText("I already have one").click();
  await sheet.getByLabel("Email", { exact: true }).fill(account.email);
  await sheet.getByLabel("Password").fill(password);
  const region = toastRegion(page);
  await expect(region).toHaveCount(1);
  await region.evaluate((element) => element.setAttribute("data-region-before-save", ""));
  await sheet.getByRole("button", { name: "Log in and save" }).click();

  await expect(page.locator("[data-region-before-save]")).toHaveText(
    "Saved. Open it anywhere with your account.",
  );
  await expect(page).toHaveURL(new RegExp(`/g/${gm.groupId}\\?`));
  await expect(page.getByRole("button", { name: "Your account" })).toBeVisible();
  await expect(page.locator("[data-month-heading]")).toBeFocused();
  await expect(page.getByText(`/s/${gm.shareToken}`)).toBeVisible();
  await expect(dayPanel).toBeVisible();
  await expect
    .poll(async () => (await account.client.query(api.groups.mine, {})).map((group) => group.id))
    .toContain(gm.groupId);

  await page.goto(`/s/${gm.shareToken}?month=${nextMonth}`);
  await expect(page).toHaveURL(new RegExp(`/g/${gm.groupId}\\?month=${nextMonth}$`));
  await expect(page.getByText(`/s/${gm.shareToken}`)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/g/${gm.groupId}\\?month=${nextMonth}&day=`));
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

  for (const width of [390, 1280, 1600]) {
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

        if (width >= 1024) {
          await page.getByRole("button", { name: /, \w+ 6: / }).click();
          await expect(page.getByRole("region", { name: /, \w+ 6$/ })).toBeVisible();
          await shot("day-popover", false);
          await page.keyboard.press("Escape");
        }

        await page.getByRole("button", { name: "Share player link" }).click();
        await page.getByRole("button", { name: "Rotate" }).click();
        await expect(toastRegion(page)).toContainText("Link rotated.");
        await shot("rotate-undo", false);

        await switcher(page, "Thursday Crew").click();
        await expect(page.getByRole("link", { name: /My group/ })).toBeVisible();
        await shot("switcher", false);
        await context.close();
      });

      test(`${String(width)}px ${colorScheme}: Add player in reach, the maybe bar and a dense day`, async ({
        browser,
      }) => {
        const crew = await signInAnonymousGm();
        await seedCrew(crew);
        const dense = await signInAnonymousGm();
        const denseAnswers: Answer[] = [
          "free",
          "free",
          "free",
          "free",
          "free",
          "free",
          "free",
          "busy",
          "busy",
        ];
        for (const [index, name] of "Ana Ben Chiara Dev Eli Fay Gus Hal Ivo Jo Kai Lu"
          .split(" ")
          .entries()) {
          const answer = denseAnswers[index];
          await seedPlayer(dense, name, answer ? { [night(5)]: answer, [night(6)]: "free" } : {});
        }

        const context = await browser.newContext({
          viewport: { width, height: width < 640 ? 844 : 1000 },
          colorScheme,
        });
        const page = await context.newPage();
        const shot = (name: string) =>
          page.screenshot({
            path: `${screenshotDir ?? ""}/${name}--${String(width)}--${colorScheme}.png`,
            animations: "disabled",
          });
        const later = () =>
          page
            .getByRole("region", { name: "Save your group" })
            .getByRole("button", { name: "Later" })
            .click();

        await openAsGm(page, crew, `/g/${crew.groupId}?month=${nextMonth}`);
        await later();
        await expect(page.locator('[data-bar="maybe"]').first()).toBeVisible();
        await shot("add-player-in-reach");
        await page
          .locator("section")
          .filter({ has: page.locator("[data-month-heading]") })
          .screenshot({
            path: `${screenshotDir ?? ""}/maybe-bar--${String(width)}--${colorScheme}.png`,
            animations: "disabled",
          });
        if (width < 640) {
          await page.getByRole("button", { name: "Add player" }).click();
          await expect(
            playersCard(page).getByRole("textbox", { name: "Player name" }),
          ).toBeFocused();
          await shot("add-player-opened");
        }

        await context.close();

        const denseContext = await browser.newContext({
          viewport: { width, height: width < 640 ? 844 : 1000 },
          colorScheme,
        });
        const densePage = await denseContext.newPage();
        await openAsGm(densePage, dense, `/g/${dense.groupId}?month=${nextMonth}`);
        await expect(densePage.locator('[data-count="unanswered"]').first()).toBeVisible();
        await densePage.screenshot({
          path: `${screenshotDir ?? ""}/dense-day--${String(width)}--${colorScheme}.png`,
          fullPage: true,
          animations: "disabled",
        });
        await denseContext.close();
      });

      test(`${String(width)}px ${colorScheme}: a fresh Group and grey bars`, async ({
        browser,
      }) => {
        const gm = await signInAnonymousGm();
        const context = await browser.newContext({
          viewport: { width, height: width < 640 ? 844 : 1000 },
          colorScheme,
        });
        const page = await context.newPage();
        const shot = (name: string) =>
          page.screenshot({
            path: `${screenshotDir ?? ""}/${name}--${String(width)}--${colorScheme}.png`,
            fullPage: true,
            animations: "disabled",
          });

        await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);
        await expect(playersCard(page).getByRole("textbox", { name: "Player name" })).toBeVisible();
        await shot("fresh-group");

        await seedCrew(gm);
        await seedPlayer(gm, "Dev");
        await expect(playersCard(page).getByRole("listitem")).toHaveCount(4);
        await page
          .getByRole("region", { name: "Save your group" })
          .getByRole("button", { name: "Later" })
          .click();
        await shot("grey-bars");
        await context.close();
      });
    }
  }
});
