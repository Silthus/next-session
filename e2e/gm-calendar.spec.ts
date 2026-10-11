import { expect, test, type Locator, type Page } from "@playwright/test";
import { api } from "../convex/_generated/api";
import { addMonths, monthOf, todayUtc } from "../shared/dates";
import { openAsGm, seedPlayer, signInAnonymousGm, toastRegion, type Gm } from "./helpers";

let today = todayUtc(Date.now());
let nextMonth = addMonths(monthOf(today), 1);

test.beforeEach(() => {
  today = todayUtc(Date.now());
  nextMonth = addMonths(monthOf(today), 1);
});

const night = (day: number) => `${nextMonth}-${String(day).padStart(2, "0")}`;
const dayCell = (page: Page, name: RegExp) => page.getByRole("button", { name });

async function seedThreePlayers(gm: Gm) {
  await seedPlayer(gm, "Ana", { [night(5)]: "free", [night(6)]: "free", [night(7)]: "busy" });
  await seedPlayer(gm, "Ben", { [night(5)]: "free", [night(6)]: "maybe" });
  await seedPlayer(gm, "Chiara", { [night(5)]: "free", [night(6)]: "busy" });
}

test("the GM reads the heat-map and sees who is free on a night", async ({ page }) => {
  const gm = await signInAnonymousGm();
  await seedThreePlayers(gm);
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

  await expect(page.getByRole("heading", { level: 1, name: "My group" })).toBeVisible();
  await expect(dayCell(page, /, \w+ 5: everyone free$/)).toBeVisible();
  await expect(dayCell(page, /, \w+ 7: 0 free, 0 maybe, 1 busy, 2 not answered$/)).toBeVisible();

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

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("a tapped night slides its detail in place of the calendar and back", async ({ page }) => {
    const gm = await signInAnonymousGm();
    await seedThreePlayers(gm);
    await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);
    const monthHeading = page.locator("[data-month-heading]");
    const month = await monthHeading.innerText();
    const night6 = dayCell(page, /, \w+ 6: /);
    const detail = page.getByRole("region", { name: /, \w+ 6$/ });

    const openNight6 = async () => {
      await night6.tap();
      await expect(detail.getByRole("heading")).toBeFocused();
      await expect(monthHeading).toBeHidden();
    };
    const expectBackOnNight6 = async () => {
      await expect(detail).toBeHidden();
      await expect(monthHeading).toHaveText(month);
      await expect(page).not.toHaveURL(/day=/);
      await expect(night6).toBeFocused();
    };

    await openNight6();
    await expect(page).toHaveURL(new RegExp(`day=${night(6)}`));
    await expect(detail.getByRole("listitem")).toHaveText([
      /Ana.*Free/,
      /Ben.*Maybe/,
      /Chiara.*Busy/,
    ]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await detail.getByRole("button", { name: `Back to ${month}` }).tap();
    await expectBackOnNight6();

    await openNight6();
    await page.keyboard.press("Escape");
    await expectBackOnNight6();

    await openNight6();
    await page.goBack();
    await expectBackOnNight6();
  });

  test("Undo in the night's detail keeps focus there", async ({ page }) => {
    const gm = await signInAnonymousGm();
    await seedThreePlayers(gm);
    await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}&day=${night(5)}`);

    const detail = page.getByRole("region", { name: /, \w+ 5$/ });
    await detail.getByRole("button", { name: "Schedule session" }).tap();
    const toast = toastRegion(page);
    await toast.getByRole("button", { name: "Undo" }).focus();
    await page.keyboard.press("Enter");
    await expect(detail.getByRole("button", { name: "Schedule session" })).toBeVisible();
    await expect(detail.getByRole("heading")).toBeFocused();
  });
});

test("on a phone a dense day keeps two-digit counts inside its cell", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const gm = await signInAnonymousGm();
  for (let index = 0; index < 30; index++) {
    const answer = index < 10 ? "free" : index < 20 ? "busy" : null;
    await seedPlayer(gm, `Player ${String(index)}`, answer ? { [night(5)]: answer } : {});
  }
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}`);

  const day = dayCell(page, /, \w+ 5: 10 free, 0 maybe, 10 busy, 10 not answered$/);
  await expect(day.locator("[data-count]")).toHaveText(["10/30", "✕10", "10"]);
  for (const count of await day.locator("[data-count]").all()) {
    expect(await isInside(count, day)).toBe(true);
  }
});

async function isInside(inner: Locator, outer: Locator) {
  const [box, frame] = await Promise.all([inner.boundingBox(), outer.boundingBox()]);
  if (!box || !frame) return false;
  return (
    box.x >= frame.x &&
    box.y >= frame.y &&
    box.x + box.width <= frame.x + frame.width &&
    box.y + box.height <= frame.y + frame.height
  );
}

test("the GM schedules a Session, unschedules it, and undoes that", async ({ page }) => {
  const gm = await signInAnonymousGm();
  await seedThreePlayers(gm);
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth}&day=${night(5)}`);

  const panel = page.getByRole("region", { name: /, \w+ 5$/ });
  const toast = toastRegion(page);
  await panel.getByRole("button", { name: "Schedule session" }).click();
  await expect(toast).toContainText("Players see it on the link.");
  await expect(dayCell(page, /, \w+ 5: everyone free, Session scheduled$/)).toBeVisible();
  await expect.poll(() => sessionDates(gm)).toEqual([night(5)]);

  await toast.getByRole("button", { name: "Undo" }).focus();
  await page.keyboard.press("Enter");
  await expect(dayCell(page, /, \w+ 5: everyone free$/)).toBeVisible();
  await expect(dayCell(page, /, \w+ 5: /)).toBeFocused();
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
  await expect(next).toBeFocused();

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
