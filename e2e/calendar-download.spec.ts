import { expect, test } from "@playwright/test";
import { api } from "../convex/_generated/api";
import { addMonths, monthOf, todayUtc } from "../shared/dates";
import { signInAnonymousGm, waitUntilPublished } from "./helpers";

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
  const lines = (await response.text()).replace(/\r\n /g, "").split("\r\n");
  expect(lines).toEqual(
    expect.arrayContaining([
      `UID:${sessionId}@next-session.link`,
      "SUMMARY:Thursday Crew",
      `URL:${baseURL}/s/${gm.shareToken}`,
    ]),
  );
});

test("an unknown Share Token downloads nothing", async ({ request }) => {
  const response = await request.get("/cal/s/UnknownTok.ics");

  expect(response.status()).toBe(404);
  expect(await response.text()).toBe("");
});
