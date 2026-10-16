import { expect, test, type Page } from "@playwright/test";
import { api } from "../convex/_generated/api";
import { addMonths, monthOf, todayUtc } from "../shared/dates";
import {
  failRequest,
  interceptSync,
  openAsGm,
  seedPlayer,
  serverError,
  signInAnonymousGm,
  toastRegion,
} from "./helpers";

test.use({ timezoneId: "Europe/Berlin" });

const nextMonth = () => addMonths(monthOf(todayUtc(Date.now())), 1);
const sessionsCard = (page: Page) => page.getByRole("region", { name: "Sessions" });
const groupMenu = (page: Page) =>
  page.getByRole("heading", { level: 1 }).getByRole("button", { name: "Thursday Crew" });

test("the GM sets the Group's time and place, schedules a night, and the player sees both", async ({
  page,
  browser,
}) => {
  const gm = await signInAnonymousGm();
  await gm.client.mutation(api.groups.rename, { groupId: gm.groupId, name: "Thursday Crew" });
  await seedPlayer(gm, "Ana");
  await openAsGm(page, gm, `/g/${gm.groupId}?month=${nextMonth()}`);

  await groupMenu(page).click();
  await expect(page.getByRole("button", { name: "Time and place, new" })).toBeVisible();
  await page.keyboard.press("Escape");
  const prompt = sessionsCard(page);
  await expect(prompt.getByText("When and where do you play?")).toBeVisible();
  await expect(
    prompt.getByText("Calendars show 19:00 to 23:00 until you change it."),
  ).toBeVisible();

  await prompt.getByRole("button", { name: "Set time and place" }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${gm.groupId}/settings$`));
  await expect(page.getByRole("heading", { name: "When and where you play" })).toBeVisible();
  await expect(page.getByLabel("Starts at")).toHaveValue("19:00");
  await page.getByLabel("Starts at").fill("18:30");
  await page.getByRole("radio", { name: "3 h" }).click();
  await expect(page.getByText("Until about 21:30")).toBeVisible();
  await page.getByLabel("Where").fill("Max's place");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(new RegExp(`/g/${gm.groupId}$`));
  await expect(toastRegion(page)).toContainText("Time and place saved");
  await expect(
    sessionsCard(page).getByRole("button", {
      name: "Edit time and place, 18:30–21:30 · Max's place",
    }),
  ).toBeVisible();
  await expect(sessionsCard(page).getByText("When and where do you play?")).toHaveCount(0);
  await expect(gm.client.query(api.groups.settings, { groupId: gm.groupId })).resolves.toEqual({
    startTime: "18:30",
    lengthMinutes: 180,
    timeZone: "Europe/Berlin",
    location: "Max's place",
    saved: true,
  });

  await groupMenu(page).click();
  await expect(page.getByRole("button", { name: "Time and place", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  const night = `${nextMonth()}-12`;
  await page.goto(`/g/${gm.groupId}?month=${nextMonth()}&day=${night}`);
  await expect(
    page.getByText("Players' calendars will show 18:30–21:30 · Max's place"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Schedule session" }).click();
  await expect(page.getByRole("button", { name: "Cancel session" })).toBeVisible();
  await expect(
    sessionsCard(page).getByRole("button", { name: new RegExp(`, \\w+ 12`) }),
  ).toContainText("18:30–21:30");

  const playerContext = await browser.newContext({ timezoneId: "Europe/Berlin" });
  const player = await playerContext.newPage();
  await player.goto(`/s/${gm.shareToken}`);
  await player.getByRole("button", { name: "Ana", exact: true }).click();
  const nextSession = player
    .getByRole("region", { name: "Next sessions" })
    .getByRole("listitem")
    .filter({ hasText: new RegExp(`\\w+ 12`) });
  await expect(nextSession).toContainText("18:30–21:30");
  await expect(nextSession).toContainText("Max's place");
  await playerContext.close();
});

test("a Group the GM does not own shows the not-found screen", async ({ page }) => {
  const gm = await signInAnonymousGm();
  const stranger = await signInAnonymousGm();
  await openAsGm(page, gm, `/g/${stranger.groupId}/settings`);
  await expect(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
  await page.goto("/g/not-a-group/settings");
  await expect(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
});

test("a Save that fails leaves the GM on the Save button", async ({ page }) => {
  const gm = await signInAnonymousGm();
  let fail = () => {};
  await interceptSync(page, (text, { client }) => {
    if (!text.includes('"udfPath":"groups:updateSettings"')) return false;
    fail = () => failRequest(client, text, serverError);
    return true;
  });
  await openAsGm(page, gm, `/g/${gm.groupId}/settings`);
  await page.getByLabel("Where").fill("Max's place");
  const save = page.getByRole("button", { name: "Save" });

  await save.click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeVisible();
  fail();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(save).toBeFocused();
});
