import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { api } from "../convex/_generated/api";
import { addMonths, monthOf, todayUtc } from "../shared/dates";
import { sessionWindow } from "../shared/sessionTime";
import { seedPlayer, signInAnonymousGm, waitUntilPublished } from "./helpers";

const unfoldedLines = (calendar: string) => calendar.replace(/\r\n /g, "").split("\r\n");
const icsUtc = (epochMs: number) =>
  new Date(epochMs)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

test("anyone with the Share Link downloads the Group's published night as a calendar file", async ({
  request,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const gm = await signInAnonymousGm();
  const night = `${addMonths(monthOf(todayUtc(Date.now())), 1)}-12`;
  await gm.client.mutation(api.groups.rename, { groupId: gm.groupId, name: "Thursday Crew" });
  const sessionId = await gm.client.mutation(api.sessions.schedule, {
    groupId: gm.groupId,
    date: night,
  });
  await waitUntilPublished(gm.client, gm.groupId, night);

  const response = await request.get(`/cal/s/${gm.shareToken}.ics`);

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
  expect(response.headers()["content-disposition"]).toBe('attachment; filename="next-session.ics"');
  const lines = unfoldedLines(await response.text());
  expect(lines).toEqual(
    expect.arrayContaining([
      `UID:${sessionId}@next-session.link`,
      "SUMMARY:Thursday Crew",
      `URL:${baseURL}/s/${gm.shareToken}`,
    ]),
  );
});

test.describe("on the player page", () => {
  test.use({ timezoneId: "Europe/Berlin" });

  test("a player adds the Group's published night to their calendar from Next sessions", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const gm = await signInAnonymousGm();
    const time = { startTime: "18:30", lengthMinutes: 180, timeZone: "Europe/Berlin" } as const;
    await gm.client.mutation(api.groups.rename, { groupId: gm.groupId, name: "Thursday Crew" });
    await gm.client.mutation(api.groups.updateSettings, {
      groupId: gm.groupId,
      ...time,
      location: "Max's place",
    });
    await seedPlayer(gm, "Ana");
    const night = `${addMonths(monthOf(todayUtc(Date.now())), 1)}-12`;
    await gm.client.mutation(api.sessions.schedule, { groupId: gm.groupId, date: night });
    await waitUntilPublished(gm.client, gm.groupId, night);

    await page.goto(`/s/${gm.shareToken}`);
    await page.getByRole("button", { name: "Ana", exact: true }).click();
    const nextSessions = page.getByRole("region", { name: "Next sessions" });
    await expect(nextSessions.getByRole("listitem")).toContainText("18:30–21:30");
    await expect(
      nextSessions.getByText(
        "A one-time copy. Keep this group to get moves and cancellations too.",
      ),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await nextSessions.getByRole("link", { name: "Add to calendar" }).click();

    const file = await download;
    expect(file.suggestedFilename()).toBe("next-session.ics");
    const window = sessionWindow(night, time);
    expect(unfoldedLines(await readFile(await file.path(), "utf8"))).toEqual(
      expect.arrayContaining([
        "SUMMARY:Thursday Crew",
        `DTSTART:${icsUtc(window.start)}`,
        `DTEND:${icsUtc(window.end)}`,
        "LOCATION:Max's place",
        "STATUS:CONFIRMED",
      ]),
    );
  });
});

test("an unknown Share Token downloads nothing", async ({ request }) => {
  const response = await request.get("/cal/s/UnknownTok.ics");

  expect(response.status()).toBe(404);
  expect(await response.text()).toBe("");
});
