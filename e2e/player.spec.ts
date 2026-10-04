import { expect, test, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { ANSWERS } from "../shared/answers";
import { addMonths, monthDays, monthOf, todayUtc, type IsoDate } from "../shared/dates";
import { convexUrl } from "./helpers";

const screenshotDir = "test-results/player-screenshots";

type SeededGroup = Awaited<ReturnType<typeof seedGroup>>;

async function seedGroup(players: string[] = ["Ana", "Ben", "Chiara"]) {
  const gm = new ConvexHttpClient(convexUrl);
  const { tokens } = await gm.action(api.auth.signIn, { provider: "anonymous" });
  gm.setAuth(tokens!.token);
  const groupId = await gm.mutation(api.groups.create, {});
  await gm.mutation(api.groups.rename, { groupId, name: "Thursday Crew" });
  const playerIds: Record<string, Id<"players">> = {};
  for (const name of players) {
    playerIds[name] = await gm.mutation(api.roster.addPlayer, { groupId, name });
  }
  const { shareToken } = (await gm.query(api.groups.get, { groupId }))!;
  return { gm, groupId, shareToken, playerIds, link: `/s/${shareToken}` };
}

function dayLabel(date: IsoDate) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function monthName(month: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

function tile(page: Page, date: IsoDate) {
  return page.getByRole("button", { name: new RegExp(`^${dayLabel(date)}:`) });
}

async function answerAs(page: Page, group: SeededGroup, name: string) {
  await rememberPlayerWithoutHint(page, group, name);
  await markHintSeen(page, group);
}

async function markHintSeen(page: Page, group: SeededGroup) {
  await page.addInitScript((groupId) => {
    localStorage.setItem(`next-session.playerHint.${groupId}`, "1");
  }, group.groupId);
}

async function playerAnswersInMonth(group: SeededGroup, name: string, month: string) {
  const schedule = await group.gm.query(api.schedule.month, { groupId: group.groupId, month });
  return schedule!.answers.filter((answer) => answer.playerId === group.playerIds[name]);
}

async function savedAnswers(group: SeededGroup, name: string, month: string) {
  const answers = await playerAnswersInMonth(group, name, month);
  return Object.fromEntries(answers.map(({ date, answer }) => [date, answer]));
}

async function playerIdOf(group: SeededGroup, name: string) {
  const view = await group.gm.query(api.player.group, { shareToken: group.shareToken });
  return view!.players.find((player) => player.name === name)!._id;
}

async function rememberPlayerWithoutHint(page: Page, group: SeededGroup, name: string) {
  await page.addInitScript(
    ({ groupId, playerId, name }) => {
      localStorage.setItem(
        "next-session.players",
        JSON.stringify({ [groupId]: { playerId, name } }),
      );
    },
    { groupId: group.groupId, playerId: group.playerIds[name]!, name },
  );
}

async function holdMutations(page: Page) {
  const held: string[] = [];
  let holding = true;
  let releaseTo: (text: string) => void = () => undefined;
  await page.routeWebSocket(/\/api\/.*\/sync/, (client) => {
    const server = client.connectToServer();
    client.onMessage((message) => {
      const text = String(message);
      if (holding && text.includes('"type":"Mutation"')) held.push(text);
      else server.send(message);
    });
    server.onMessage((message) => client.send(message));
    releaseTo = (text) => server.send(text);
  });
  return {
    heldCount: () => held.length,
    release: () => {
      holding = false;
      held.splice(0).forEach((text) => releaseTo(text));
    },
  };
}

function currentDates() {
  const today = todayUtc(Date.now());
  const month = monthOf(today);
  return { today, month, bookableDays: monthDays(month).filter((date) => date >= today) };
}

function progressText(answered: number, fillable: number) {
  return answered === fillable ? "All nights set" : `${answered} of ${fillable} nights set`;
}

test.describe("the player surface", () => {
  test("a new player joins by name, answers, fills the rest, and comes back", async ({ page }) => {
    const { today, month, bookableDays } = currentDates();
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const group = await seedGroup();
    await group.gm.mutation(api.sessions.schedule, { groupId: group.groupId, date: today });

    await page.goto(group.link);
    await expect(page.getByRole("heading", { level: 1, name: "Thursday Crew" })).toBeVisible();
    await expect(page).toHaveTitle("Thursday Crew · Next Session");
    await page.getByRole("textbox", { name: "Not listed? Your name" }).fill("Dev");
    await page.getByRole("button", { name: "Join" }).click();

    await expect(page.getByText("Answering as")).toContainText("Dev");
    group.playerIds.Dev = await playerIdOf(group, "Dev");
    await expect(page.getByRole("tooltip")).toBeVisible();
    await expect(page.getByText(progressText(0, bookableDays.length))).toBeVisible();
    await tile(page, today).click();
    await expect(tile(page, today)).toHaveAccessibleName(`${dayLabel(today)}: Free, Session`);
    await expect(page.getByRole("tooltip")).toBeHidden();
    await tile(page, today).click();
    await expect(tile(page, today)).toHaveAccessibleName(`${dayLabel(today)}: Maybe, Session`);
    await expect.poll(() => savedAnswers(group, "Dev", month)).toEqual({ [today]: "maybe" });

    await page.reload();
    await expect(page.getByText("Answering as")).toContainText("Dev");
    await expect(tile(page, today)).toHaveAccessibleName(`${dayLabel(today)}: Maybe, Session`);
    await expect(page.getByRole("tooltip")).toBeHidden();

    const remaining = bookableDays.length - 1;
    if (remaining > 0) {
      await page
        .getByRole("button", {
          name: `Mark the other ${remaining} night${remaining === 1 ? "" : "s"} busy`,
        })
        .click();
    }
    await expect(page.getByText(`All set for ${monthName(month)} ✓`)).toBeVisible();
    await expect(page.getByText("All nights set")).toBeVisible();

    await expect
      .poll(() => savedAnswers(group, "Dev", month))
      .toEqual(
        Object.fromEntries(bookableDays.map((date) => [date, date === today ? "maybe" : "busy"])),
      );

    await page.getByRole("button", { name: `Fill ${monthName(addMonths(month, 1))} →` }).click();
    await expect(page).toHaveURL(new RegExp(`month=${addMonths(month, 1)}`));
    await expect(page.getByRole("heading", { level: 2 })).toContainText(
      monthName(addMonths(month, 1)),
    );
    expect(pageErrors).toEqual([]);
  });

  test("taps and Fill Rest show at once, before the backend answers", async ({ page }) => {
    const { today, month, bookableDays } = currentDates();
    const group = await seedGroup();
    await rememberPlayerWithoutHint(page, group, "Ana");
    const mutations = await holdMutations(page);

    await page.goto(group.link);
    await expect(page.getByRole("tooltip")).toBeVisible();
    await tile(page, today).click();
    await expect(tile(page, today)).toHaveAccessibleName(`${dayLabel(today)}: Free`);
    await expect(page.getByText(progressText(1, bookableDays.length))).toBeVisible();
    if (bookableDays.length > 1) {
      await page.getByRole("button", { name: /^Mark the other/ }).click();
    }
    await expect(page.getByText(`All set for ${monthName(month)} ✓`)).toBeVisible();
    await expect.poll(() => mutations.heldCount()).toBe(bookableDays.length > 1 ? 2 : 1);
    expect(await savedAnswers(group, "Ana", month)).toEqual({});

    mutations.release();
    await expect
      .poll(() => savedAnswers(group, "Ana", month))
      .toEqual(
        Object.fromEntries(bookableDays.map((date) => [date, date === today ? "free" : "busy"])),
      );
  });

  test("a first Fill Rest dismisses the first-visit hint", async ({ page }) => {
    const { bookableDays } = currentDates();
    const group = await seedGroup();
    await rememberPlayerWithoutHint(page, group, "Ana");

    await page.goto(group.link);
    await expect(page.getByRole("tooltip")).toBeVisible();
    test.skip(bookableDays.length === 1, "only today is left to answer this month");
    await page.getByRole("button", { name: /^Mark the other/ }).click();

    await expect(page.getByRole("tooltip")).toBeHidden();
    await page.reload();
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(page.getByRole("tooltip")).toBeHidden();
  });

  test("a tap the backend refuses rolls back and says why", async ({ page }) => {
    const group = await seedGroup();
    await answerAs(page, group, "Ana");
    const yesterday = todayUtc(Date.now() - 86_400_000);
    await page.clock.setFixedTime(new Date(`${yesterday}T12:00:00Z`));

    await page.goto(group.link);
    await tile(page, yesterday).click();

    await expect(page.getByRole("status")).toHaveText("That night is locked now.");
    await expect(tile(page, yesterday)).toHaveAccessibleName(`${dayLabel(yesterday)}: Not set`);
    expect(await savedAnswers(group, "Ana", monthOf(yesterday))).toEqual({});
  });

  test("tapping a night back to not set clears its Answer", async ({ page }) => {
    const { today, month } = currentDates();
    const group = await seedGroup();
    await answerAs(page, group, "Ana");

    await page.goto(group.link);
    await tile(page, today).click();
    await expect.poll(() => savedAnswers(group, "Ana", month)).toEqual({ [today]: "free" });
    for (const label of ["Maybe", "Busy", "Not set"]) {
      await tile(page, today).click();
      await expect(tile(page, today)).toHaveAccessibleName(`${dayLabel(today)}: ${label}`);
    }

    await expect.poll(() => savedAnswers(group, "Ana", month)).toEqual({});
    await page.reload();
    await expect(tile(page, today)).toHaveAccessibleName(`${dayLabel(today)}: Not set`);
  });

  test("a Fill Rest the backend refuses rolls back and says why", async ({ page }) => {
    const group = await seedGroup();
    await answerAs(page, group, "Ana");
    const beyondWindow = addMonths(currentDates().month, 3);
    await page.clock.setFixedTime(new Date(`${beyondWindow}-15T12:00:00Z`));

    await page.goto(group.link);
    await page.getByRole("button", { name: /^Mark the other/ }).click();

    await expect(page.getByRole("status")).toHaveText("Those nights are locked now.");
    const nightsLeft = monthDays(beyondWindow).filter((date) => date >= `${beyondWindow}-15`);
    await expect(page.getByText(progressText(0, nightsLeft.length))).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Mark the other ${nightsLeft.length} nights busy` }),
    ).toBeVisible();
    expect(await savedAnswers(group, "Ana", beyondWindow)).toEqual({});
  });

  test("a listed player answers with one tap and can switch with Not you?", async ({ page }) => {
    const { today, month } = currentDates();
    const group = await seedGroup();

    await page.goto(group.link);
    await page.getByRole("button", { name: "Ben", exact: true }).click();
    await expect(page.getByText("Answering as")).toContainText("Ben");
    await tile(page, today).click();
    await expect.poll(async () => (await playerAnswersInMonth(group, "Ben", month)).length).toBe(1);

    await page.getByRole("button", { name: "Not you?" }).click();
    await expect(page.getByRole("heading", { name: "Who are you?" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Who are you?" })).toBeVisible();
  });

  test("a taken name points at the existing chip", async ({ page }) => {
    const group = await seedGroup();

    await page.goto(group.link);
    await page.getByRole("textbox", { name: "Not listed? Your name" }).fill("  ana ");
    await page.getByRole("button", { name: "Join" }).click();

    await expect(page.getByRole("alert")).toHaveText(
      "That name exists. Tap it, or add a last initial.",
    );
    await expect(
      page.getByRole("button", { name: "Ana", exact: true }),
    ).toHaveAccessibleDescription("That name exists. Tap it, or add a last initial.");
  });

  test("a player the GM removed lands on the join screen", async ({ page }) => {
    const group = await seedGroup();
    await answerAs(page, group, "Chiara");

    await page.goto(group.link);
    await expect(page.getByText("Answering as")).toContainText("Chiara");
    await group.gm.mutation(api.roster.removePlayer, { playerId: group.playerIds.Chiara! });

    await expect(
      page.getByText("Your name is no longer on the list. Pick or add one."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Chiara", exact: true })).toHaveCount(0);
  });

  test("a past month is read-only", async ({ page }) => {
    const { today, month } = currentDates();
    const group = await seedGroup();
    await answerAs(page, group, "Ana");
    await page.goto(group.link);
    await tile(page, today).click();
    await expect.poll(async () => (await playerAnswersInMonth(group, "Ana", month)).length).toBe(1);

    await page.clock.setFixedTime(new Date(`${addMonths(month, 1)}-15T12:00:00Z`));
    await page.goto(`${group.link}?month=${month}`);

    await expect(page.getByText("Past · read only")).toBeVisible();
    await expect(tile(page, today)).toHaveAccessibleName(`${dayLabel(today)}: Free`);
    await expect(tile(page, today)).toBeDisabled();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Mark the other/ })).toHaveCount(0);
  });

  test("an unknown link says it no longer works", async ({ page }) => {
    await page.goto("/s/no-such-link");

    await expect(
      page.getByRole("heading", { level: 1, name: "This link no longer works" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("This link no longer works · Next Session");
    await expect(page.getByRole("link", { name: "Plan your own game" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});

test.describe("player surface screenshots", () => {
  test.skip(!process.env.PLAYER_SCREENSHOTS, "proof screenshots: run with PLAYER_SCREENSHOTS=1");
  const viewports = [
    { label: "390", width: 390, height: 844 },
    { label: "1440", width: 1440, height: 900 },
  ];
  const schemes = ["light", "dark"] as const;

  async function seedAnswers(group: SeededGroup, name: string) {
    const today = todayUtc(Date.now());
    const days = monthDays(monthOf(today)).filter((date) => date >= today);
    const answered = days.slice(0, Math.ceil(days.length / 2));
    for (const [index, date] of answered.entries()) {
      await group.gm.mutation(api.player.answer, {
        shareToken: group.shareToken,
        playerId: group.playerIds[name]!,
        date,
        answer: ANSWERS[index % ANSWERS.length]!,
      });
    }
    return days;
  }

  test("every player screen at 390 and 1440 px, light and dark", async ({ page }) => {
    test.setTimeout(120_000);
    const group = await seedGroup(["Ana", "Ben", "Chiara", "Dev", "Eli"]);
    const days = await seedAnswers(group, "Ana");
    await group.gm.mutation(api.sessions.schedule, {
      groupId: group.groupId,
      date: days[Math.min(2, days.length - 1)]!,
    });
    await markHintSeen(page, group);

    for (const viewport of viewports) {
      for (const colorScheme of schemes) {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        const suffix = `${viewport.label}-${colorScheme}`;

        await page.goto(group.link);
        await expect(page.getByRole("heading", { name: "Who are you?" })).toBeVisible();
        await page.screenshot({
          path: `${screenshotDir}/join-${suffix}.png`,
          fullPage: true,
          animations: "disabled",
        });

        await page.getByRole("button", { name: "Ana", exact: true }).click();
        await expect(page.getByRole("progressbar")).toBeVisible();
        await expect(page.getByRole("tooltip")).toBeHidden();
        await page.screenshot({
          path: `${screenshotDir}/calendar-${suffix}.png`,
          fullPage: true,
          animations: "disabled",
        });

        await page.getByRole("button", { name: "Not you?" }).click();
        await page.goto("/s/no-such-link");
        await expect(
          page.getByRole("heading", { name: "This link no longer works" }),
        ).toBeVisible();
        await page.screenshot({
          path: `${screenshotDir}/unknown-link-${suffix}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  });

  test("the past month at 390 and 1440 px, light and dark", async ({ page }) => {
    const group = await seedGroup(["Ana", "Ben"]);
    await seedAnswers(group, "Ana");
    await answerAs(page, group, "Ana");
    const month = monthOf(todayUtc(Date.now()));
    await page.clock.setFixedTime(new Date(`${addMonths(month, 1)}-15T12:00:00Z`));

    for (const viewport of viewports) {
      for (const colorScheme of schemes) {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        await page.goto(`${group.link}?month=${month}`);
        await expect(page.getByText("Past · read only")).toBeVisible();
        await page.screenshot({
          path: `${screenshotDir}/past-month-${viewport.label}-${colorScheme}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  });

  async function captureEveryVariant(
    page: Page,
    link: string,
    name: string,
    ready: () => Promise<void>,
  ) {
    for (const viewport of viewports) {
      for (const colorScheme of schemes) {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        await page.goto(link);
        await ready();
        await page.screenshot({
          path: `${screenshotDir}/${name}-${viewport.label}-${colorScheme}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }

  test("the first-visit hint at 390 and 1440 px, light and dark", async ({ page }) => {
    const group = await seedGroup(["Ana", "Ben"]);
    await rememberPlayerWithoutHint(page, group, "Ana");

    await captureEveryVariant(page, group.link, "hint", () =>
      expect(page.getByRole("tooltip")).toBeVisible(),
    );
  });

  test("the done card at 390 and 1440 px, light and dark", async ({ page }) => {
    const group = await seedGroup(["Ana", "Ben"]);
    await group.gm.mutation(api.player.fillRest, {
      shareToken: group.shareToken,
      playerId: group.playerIds.Ben!,
      month: monthOf(todayUtc(Date.now())),
    });
    await answerAs(page, group, "Ben");

    await captureEveryVariant(page, group.link, "done", () =>
      expect(page.getByText("Your GM sees it already.")).toBeVisible(),
    );
  });
});
