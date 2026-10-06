import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Answer } from "../shared/answers";
import { monthDays, monthOf, todayUtc } from "../shared/dates";
import { convexUrl, openAsGm, signInAnonymousGm } from "./helpers";

const dir = process.env.THEME_SHOTS;
const cycle: Answer[] = ["free", "free", "maybe", "busy", "free"];

test.describe("theme shots", () => {
  test.skip(!dir, "Set THEME_SHOTS to a directory");

  for (const width of [390, 1440]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${String(width)} ${colorScheme}`, async ({ browser }) => {
        test.setTimeout(120_000);
        const month = monthOf(todayUtc(Date.now()));
        const today = todayUtc(Date.now());
        const days = monthDays(month).filter((date) => date >= today);
        const gm = await signInAnonymousGm();
        await gm.client.mutation(api.groups.rename, { groupId: gm.groupId, name: "Thursday Crew" });
        const ids: Record<string, string> = {};
        for (const [p, name] of ["Ana", "Ben", "Chiara", "Dev"].entries()) {
          const visitor = new ConvexHttpClient(convexUrl);
          const playerId = await visitor.mutation(api.player.join, {
            shareToken: gm.shareToken,
            name,
          });
          ids[name] = playerId;
          for (const [i, date] of days.slice(0, 10).entries()) {
            await visitor.mutation(api.player.answer, {
              shareToken: gm.shareToken,
              playerId,
              date,
              answer: cycle[(i + p) % cycle.length]!,
            });
          }
        }
        await gm.client.mutation(api.sessions.schedule, {
          groupId: gm.groupId,
          date: days[Math.min(3, days.length - 1)]!,
        });

        const context = await browser.newContext({
          viewport: { width, height: width < 640 ? 844 : 900 },
          colorScheme,
        });
        const page = await context.newPage();
        const shot = (name: string, fullPage = true) =>
          page.screenshot({
            path: `${dir ?? ""}/${name}--${String(width)}--${colorScheme}.png`,
            fullPage,
            animations: "disabled",
          });

        await page.goto("/");
        await expect(page.getByRole("button", { name: "Create your link" })).toBeVisible();
        await shot("landing");
        await page.getByRole("button", { name: "Create your link" }).click();
        await expect(page.getByText("Your link is ready.", { exact: false })).toBeVisible();
        await shot("link-created");

        await openAsGm(page, gm, `/g/${gm.groupId}`);
        const nudge = page.getByRole("region", { name: "Save your group" });
        await expect(nudge).toBeVisible();
        await page.getByRole("button", { name: "Later" }).click();
        await shot("gm-calendar");

        await page.getByRole("button", { name: "Save your group" }).first().click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.waitForTimeout(400);
        await shot("save-sheet", false);
        await context.close();

        const playerContext = await browser.newContext({
          viewport: { width, height: width < 640 ? 844 : 900 },
          colorScheme,
        });
        const player = await playerContext.newPage();
        await player.addInitScript(
          ({ groupId, playerId }) => {
            localStorage.setItem(
              "next-session.players",
              JSON.stringify({ [groupId]: { playerId, name: "Ana" } }),
            );
            localStorage.setItem(`next-session.playerHint.${groupId}`, "1");
          },
          { groupId: gm.groupId, playerId: ids.Ana! },
        );
        await player.goto(`/s/${gm.shareToken}`);
        await expect(player.getByRole("progressbar")).toBeVisible();
        await player.screenshot({
          path: `${dir ?? ""}/player-calendar--${String(width)}--${colorScheme}.png`,
          fullPage: true,
          animations: "disabled",
        });
        await playerContext.close();
      });
    }
  }
});
