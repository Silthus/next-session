import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { api } from "../convex/_generated/api";
import { addMonths, monthOf, todayUtc } from "../shared/dates";
import {
  openAsGm,
  signInAnonymousGm,
  signUpAccount,
  toastRegion,
  waitUntilPublished,
} from "./helpers";

async function calendarLines(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.status()).toBe(200);
  return (await response.text()).replace(/\r\n /g, "").split("\r\n");
}

async function captureBlock(page: Page, name: string) {
  const directory = process.env.E2E_SCREENSHOTS;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: join(directory, `${name}-${width}-${colorScheme}.png`),
        fullPage: true,
      });
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 720 });
}

test("an Account subscribes its calendar app on My groups and resets the link", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const gm = await signInAnonymousGm();
  const night = `${addMonths(monthOf(todayUtc(Date.now())), 1)}-12`;
  await gm.client.mutation(api.groups.rename, { groupId: gm.groupId, name: "Thursday Crew" });
  const sessionId = await gm.client.mutation(api.sessions.schedule, {
    groupId: gm.groupId,
    date: night,
  });
  const account = await signUpAccount();
  await account.client.mutation(api.player.join, { shareToken: gm.shareToken, name: "Robin" });
  await waitUntilPublished(gm.client, gm.groupId, night);

  await openAsGm(page, account, "/me");
  const block = page.getByRole("region", { name: "Your calendar" });
  const feedLink = block.getByRole("textbox", { name: "Calendar feed link" });
  await block.getByRole("button", { name: "Subscribe in your calendar app" }).click();
  await expect(feedLink).toHaveValue(/\/cal\/a\/[A-Za-z0-9_-]{22}\.ics$/);
  const firstUrl = await feedLink.inputValue();
  await expect(block.getByRole("link", { name: "Open in calendar app" })).toHaveAttribute(
    "href",
    firstUrl.replace(/^https?:\/\//, "webcal://"),
  );
  expect(await calendarLines(request, firstUrl)).toEqual(
    expect.arrayContaining([`UID:${sessionId}@next-session.link`, "SUMMARY:Thursday Crew"]),
  );
  await captureBlock(page, "your-calendar-subscribed");

  await block.getByRole("button", { name: "Reset feed link" }).click();
  await expect(feedLink).not.toHaveValue(firstUrl);
  await expect(toastRegion(page)).toContainText("Calendars on the old link stop updating.");
  if (process.env.E2E_SCREENSHOTS) {
    await page.screenshot({
      path: join(process.env.E2E_SCREENSHOTS, "your-calendar-reset-1280-light.png"),
    });
  }
  const resetUrl = await feedLink.inputValue();

  const oldLink = await request.get(firstUrl);
  expect(oldLink.status()).toBe(404);
  expect(await oldLink.text()).toBe("");
  expect(await calendarLines(request, resetUrl)).toEqual(
    expect.arrayContaining([`UID:${sessionId}@next-session.link`]),
  );
});

test("Subscribe on My groups opens My groups at Your calendar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 });
  const gm = await signInAnonymousGm();
  const night = `${addMonths(monthOf(todayUtc(Date.now())), 1)}-12`;
  await gm.client.mutation(api.sessions.schedule, { groupId: gm.groupId, date: night });
  const account = await signUpAccount();
  await account.client.mutation(api.player.join, { shareToken: gm.shareToken, name: "Robin" });
  await openAsGm(page, account, `/s/${gm.shareToken}`);

  await page.getByRole("link", { name: "Subscribe on My groups" }).click();

  const calendar = page.getByRole("heading", { level: 2, name: "Your calendar" });
  await expect(calendar).toBeFocused();
  await expect(calendar).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});
