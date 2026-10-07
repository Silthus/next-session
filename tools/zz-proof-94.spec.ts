import { test, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { monthDays, monthOf, todayUtc, type IsoDate } from "../shared/dates";
import { convexUrl, openAsGm, signInAnonymousGm } from "./helpers";

const out = process.env.PROOF_DIR!;
const label = process.env.PROOF_LABEL!;

const viewports = [390, 1440] as const;
const themes = ["light", "dark"] as const;

test.describe.configure({ mode: "serial" });

let shareToken = "";
let groupPath = "";
let gmTokens: Awaited<ReturnType<typeof signInAnonymousGm>>["tokens"];
let anaId: Id<"players">;
let groupId: Id<"groups">;

test.beforeAll(async () => {
  const gm = await signInAnonymousGm();
  gmTokens = gm.tokens;
  groupId = gm.groupId;
  await gm.client.mutation(api.groups.rename, { groupId, name: "Thursday Crew" });
  shareToken = gm.shareToken;
  groupPath = `/g/${groupId}`;
  const today = todayUtc(Date.now());
  const future = monthDays(monthOf(today)).filter((date) => date > today);
  const pattern = ["free", "maybe", "busy", "free", "free", "maybe", "free"] as const;
  const players = ["Ana", "Ben", "Chiara", "Dev"];
  for (const [index, name] of players.entries()) {
    const visitor = new ConvexHttpClient(convexUrl);
    const playerId = await visitor.mutation(api.player.join, { shareToken, name });
    if (name === "Ana") anaId = playerId;
    for (const [dayIndex, date] of future.slice(0, 10).entries()) {
      await visitor.mutation(api.player.answer, {
        shareToken,
        playerId,
        date: date as IsoDate,
        answer: pattern[(dayIndex + index) % pattern.length]!,
      });
    }
  }
});

for (const width of viewports) {
  for (const theme of themes) {
    test(`${width} ${theme}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      const shot = async (page: Page, name: string) => {
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${out}/${label}-${name}-${width}-${theme}.png`, fullPage: true });
      };

      const landing = await context.newPage();
      await landing.goto("/");
      await landing.getByRole("button", { name: "Create your link" }).waitFor();
      await shot(landing, "landing");
      await landing.getByRole("button", { name: "Create your link" }).click();
      await landing.getByRole("link", { name: "Open your group →" }).waitFor();
      await shot(landing, "link-created");
      await landing.close();

      const gmContext = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      const gmPage = await gmContext.newPage();
      await openAsGm(gmPage, { tokens: gmTokens }, groupPath);
      await gmPage.getByText("Thursday Crew").first().waitFor();
      await gmPage.waitForTimeout(800);
      await shot(gmPage, "gm");
      await gmPage.getByRole("button", { name: "Save your group" }).first().click();
      await gmPage.getByRole("dialog").waitFor();
      await shot(gmPage, "save-sheet");
      await gmContext.close();

      const player = await context.newPage();
      await player.addInitScript(
        ({ groupId, playerId }) => {
          localStorage.setItem(
            "next-session.players",
            JSON.stringify({ [groupId]: { playerId, name: "Ana" } }),
          );
          localStorage.setItem(`next-session.playerHint.${groupId}`, "1");
        },
        { groupId, playerId: anaId },
      );
      await player.goto(`/s/${shareToken}`);
      await player.getByText("Answering as").first().waitFor();
      await shot(player, "player");
      await player.goto("/s/no-such-link");
      await player.getByRole("heading", { name: "This link no longer works" }).waitFor();
      await shot(player, "status");
      await player.goto("/terms");
      await player.waitForLoadState("networkidle");
      await shot(player, "legal");
      await player.close();
      await context.close();
    });
  }
}
