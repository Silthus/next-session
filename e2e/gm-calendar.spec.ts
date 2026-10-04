import { expect, test, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { Answer } from "../shared/answers";
import { addMonths, monthDays, monthOf, todayUtc } from "../shared/dates";

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
  const view = await client.query(api.groups.get, { groupId: group.id });
  if (!view) throw new Error("The new GM cannot read their Group");
  return { tokens, client, groupId: group.id, shareToken: view.shareToken };
}

async function seedPlayer(gm: Gm, name: string, answers: Record<string, Answer>) {
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

let today = todayUtc(Date.now());
let nextMonth = addMonths(monthOf(today), 1);

test.beforeEach(() => {
  today = todayUtc(Date.now());
  nextMonth = addMonths(monthOf(today), 1);
});

const night = (day: number) => `${nextMonth}-${String(day).padStart(2, "0")}`;
const dayCell = (page: Page, name: RegExp) => page.getByRole("button", { name });

async function seedThursdayCrew(gm: Gm) {
  await seedPlayer(gm, "Ana", { [night(5)]: "free", [night(6)]: "free", [night(7)]: "busy" });
  await seedPlayer(gm, "Ben", { [night(5)]: "free", [night(6)]: "maybe" });
  await seedPlayer(gm, "Chiara", { [night(5)]: "free", [night(6)]: "busy" });
}

test("the GM reads the heat-map and sees who is free on a night", async ({ page }) => {
  const gm = await signInAnonymousGm();
  await seedThursdayCrew(gm);
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

  await expect(page.getByRole("heading", { level: 1, name: "My group" })).toBeVisible();
  await expect(dayCell(page, /, \w+ 5: everyone free$/)).toBeVisible();
  await expect(dayCell(page, /, \w+ 7: 0 free, 0 maybe, 1 busy$/)).toBeVisible();

  await dayCell(page, /, \w+ 6: /).click();
  await expect(page).toHaveURL(new RegExp(`day=${night(6)}`));
  const panel = page.getByRole("region", { name: /, \w+ 6$/ });
  await expect(panel.getByText("1 free")).toBeVisible();
  await expect(panel.getByRole("listitem")).toHaveText([/Ana.*Free/, /Ben.*Maybe/, /Chiara.*Busy/]);

  await panel.getByRole("button", { name: "Overview" }).click();
  await expect(panel).toBeHidden();
  await expect(page).not.toHaveURL(/day=/);
  await expect(dayCell(page, /, \w+ 6: /)).toBeFocused();
});

test("on a phone the day sheet leaves the tapped night in view", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const gm = await signInAnonymousGm();
  await seedThursdayCrew(gm);
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

  const lastNight = dayCell(page, new RegExp(`, \\w+ ${String(monthDays(nextMonth).length)}: `));
  await lastNight.click();
  const sheet = page.getByRole("region", {
    name: new RegExp(`${String(monthDays(nextMonth).length)}$`),
  });
  await expect(sheet).toBeVisible();
  await expect
    .poll(async () => {
      const [cell, panel] = await Promise.all([lastNight.boundingBox(), sheet.boundingBox()]);
      return cell && panel ? cell.y + cell.height <= panel.y : false;
    })
    .toBe(true);
});

test("the GM schedules a Session, unschedules it, and undoes that", async ({ page }) => {
  const gm = await signInAnonymousGm();
  await seedThursdayCrew(gm);
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}&day=${night(5)}`);

  const panel = page.getByRole("region", { name: /, \w+ 5$/ });
  const toast = page.getByRole("status");
  await panel.getByRole("button", { name: "Schedule session" }).click();
  await expect(toast).toContainText("Players see it on the link.");
  await expect(dayCell(page, /, \w+ 5: everyone free, Session scheduled$/)).toBeVisible();
  await expect.poll(() => sessionDates(gm)).toEqual([night(5)]);

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(dayCell(page, /, \w+ 5: everyone free$/)).toBeVisible();
  await expect.poll(() => sessionDates(gm)).toEqual([]);

  await panel.getByRole("button", { name: "Schedule session" }).click();
  await expect.poll(() => sessionDates(gm)).toEqual([night(5)]);

  await panel.getByRole("button", { name: "Unschedule this session" }).click();
  await expect(toast).toContainText("removed");
  await expect(dayCell(page, /, \w+ 5: everyone free$/)).toBeVisible();
  await expect.poll(() => sessionDates(gm)).toEqual([]);

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(dayCell(page, /, \w+ 5: everyone free, Session scheduled$/)).toBeVisible();
  await expect.poll(() => sessionDates(gm)).toEqual([night(5)]);
});

async function sessionDates(gm: Gm) {
  const schedule = await gm.client.query(api.schedule.month, {
    groupId: gm.groupId,
    month: nextMonth,
  });
  return schedule?.sessions.map((session) => session.date) ?? [];
}

test("month navigation lives in the URL and stops at the end of the Booking Window", async ({
  page,
}) => {
  const gm = await signInAnonymousGm();
  await openAsGm(page, gm, `/g/${gm.groupId}`);
  const months = [monthOf(today), nextMonth, addMonths(monthOf(today), 2)].map(monthName);

  const next = page.getByRole("button", { name: "Next month" });
  await expect(page.getByRole("heading", { level: 2, name: months[0] })).toBeVisible();
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: months[1] })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`month=${nextMonth}`));
  await expect(next).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: months[2] })).toBeVisible();
  await expect(next).toBeDisabled();

  await page.getByRole("button", { name: "Previous month" }).click();
  await page.getByRole("button", { name: "Previous month" }).click();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByText("Past month")).toBeVisible();
});

function monthName(month: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

test("another GM's Group or a malformed id falls back to the GM's own Group", async ({ page }) => {
  const gm = await signInAnonymousGm();
  const stranger = await signInAnonymousGm();
  await openAsGm(page, gm, `/g/${stranger.groupId}`);
  await expect(page).toHaveURL(new RegExp(`/g/${gm.groupId}$`));
  await expect(page.getByRole("heading", { level: 1, name: "My group" })).toBeVisible();

  await page.goto("/g/not-a-group");
  await expect(page).toHaveURL(new RegExp(`/g/${gm.groupId}$`));
  await expect(page.getByRole("heading", { level: 1, name: "My group" })).toBeVisible();
});

test("a signed-out visitor lands on the landing page", async ({ page }) => {
  const stranger = await signInAnonymousGm();
  await page.goto(`/g/${stranger.groupId}`);
  await expect(page).toHaveURL(/\/$/);
});
