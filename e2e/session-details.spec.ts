import { expect, test, type Page } from "@playwright/test";
import { api } from "../convex/_generated/api";
import { addMonths, monthOf, todayUtc } from "../shared/dates";
import { openAsGm, seedPlayer, signInAnonymousGm, waitUntilPublished, type Gm } from "./helpers";

test.use({ timezoneId: "Europe/Berlin" });

const nextMonth = () => addMonths(monthOf(todayUtc(Date.now())), 1);
const night = () => `${nextMonth()}-12`;
const whenAndWhere = (page: Page) => page.getByRole("group", { name: "When and where" });
const field = (page: Page, name: string) => page.getByRole("group", { name });

async function gmWithScheduledNight() {
  const gm = await signInAnonymousGm();
  await gm.client.mutation(api.groups.rename, { groupId: gm.groupId, name: "Thursday Crew" });
  await gm.client.mutation(api.groups.updateSettings, {
    groupId: gm.groupId,
    startTime: "18:30",
    lengthMinutes: 180,
    timeZone: "Europe/Berlin",
    location: "Max's place",
  });
  await seedPlayer(gm, "Ana");
  await gm.client.mutation(api.sessions.schedule, { groupId: gm.groupId, date: night() });
  return gm;
}

async function openNight(page: Page, gm: Gm) {
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth()}&day=${night()}`);
  await page.waitForLoadState("networkidle");
}

async function sessionOf(gm: Gm) {
  const month = await gm.client.query(api.schedule.month, {
    groupId: gm.groupId,
    month: nextMonth(),
  });
  return month?.sessions[0];
}

test("the GM gives one night its own start time and place, then sets the start back to the usual", async ({
  page,
}) => {
  const gm = await gmWithScheduledNight();
  await openNight(page, gm);
  await expect(whenAndWhere(page)).toContainText("18:30–21:30 · Max's place");

  await page.getByRole("button", { name: "Edit when and where" }).click();
  await field(page, "Starts at").locator("input").fill("20:00");
  await field(page, "Where").getByRole("textbox").fill("The club");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(whenAndWhere(page)).toContainText("20:00–23:00 · The club");
  await expect(whenAndWhere(page)).toContainText("Only this night");
  await expect(sessionOf(gm)).resolves.toMatchObject({
    startTime: "20:00",
    lengthMinutes: 180,
    location: "The club",
    overrides: ["startTime", "location"],
  });

  await page.getByRole("button", { name: "Edit when and where" }).click();
  await page.getByRole("button", { name: "Use the usual start time" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(whenAndWhere(page)).toContainText("18:30–21:30 · The club");
  await expect(sessionOf(gm)).resolves.toMatchObject({
    startTime: "18:30",
    location: "The club",
    overrides: ["location"],
  });
});

const screenshotDir = process.env.E2E_SCREENSHOTS;

test.describe("screenshots", () => {
  test.skip(!screenshotDir, "Set E2E_SCREENSHOTS to a directory to capture them");

  for (const width of [390, 1280]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${String(width)}px ${colorScheme}`, async ({ browser }) => {
        test.setTimeout(120_000);
        const gm = await gmWithScheduledNight();
        await waitUntilPublished(gm.client, gm.groupId, night());
        const context = await browser.newContext({
          viewport: { width, height: width < 640 ? 844 : 1000 },
          colorScheme,
          timezoneId: "Europe/Berlin",
        });
        const page = await context.newPage();
        const shot = (name: string) =>
          page.screenshot({
            path: `${screenshotDir ?? ""}/${name}-${String(width)}-${colorScheme}.png`,
            fullPage: true,
            animations: "disabled",
          });

        await openNight(page, gm);
        await expect(whenAndWhere(page)).toContainText("18:30–21:30 · Max's place");
        await shot("day-panel-usual");

        await page.getByRole("button", { name: "Edit when and where" }).click();
        await field(page, "Starts at").locator("input").fill("20:00");
        await field(page, "Where").getByRole("textbox").fill("The club");
        await shot("day-panel-editor");

        await page.getByRole("button", { name: "Save", exact: true }).click();
        await expect(whenAndWhere(page)).toContainText("Only this night");
        await shot("day-panel-own-night");

        await gm.client.mutation(api.sessions.cancel, { sessionId: (await sessionOf(gm))!._id });
        await expect(page.getByRole("button", { name: "Schedule again" })).toBeVisible();
        await shot("day-panel-cancelled");
        await context.close();
      });
    }
  }
});
