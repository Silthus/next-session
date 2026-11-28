import { expect, test, type Browser, type Page } from "@playwright/test";
import { api } from "../convex/_generated/api";
import { addMonths, monthOf, todayUtc, type IsoDate } from "../shared/dates";
import {
  reserveAccountSignUp,
  openAsGm,
  password,
  signInAnonymousGm,
  signUpAccount,
  seedPlayer,
  shareTokenOf,
  toastRegion,
  type Gm,
} from "./helpers";

async function seedGroup(name: string) {
  const gm = await signInAnonymousGm();
  await gm.client.mutation(api.groups.rename, { groupId: gm.groupId, name });
  return { gm, link: `/s/${gm.shareToken}` };
}

function dayLabel(date: IsoDate) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function todayTile(page: Page) {
  return page.getByRole("button", { name: new RegExp(`^${dayLabel(todayUtc(Date.now()))}:`) });
}

async function join(page: Page, name: string) {
  await page.getByRole("textbox", { name: /Your name/ }).fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByText("Answering as")).toContainText(name);
}

async function answerToday(page: Page) {
  await todayTile(page).click();
  await expect(todayTile(page)).toHaveAccessibleName(/: Free$/);
}

async function fillAccount(page: Page, email: string) {
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Email", { exact: true }).fill(email);
  await sheet.getByLabel("Password").fill(password);
  return sheet;
}

async function logIn(page: Page, email: string) {
  await page.getByRole("banner").getByRole("button", { name: "Log in" }).click();
  const sheet = await fillAccount(page, email);
  await sheet.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "Your account" })).toBeVisible();
}

function keepInvite(page: Page) {
  return page
    .getByRole("region", { name: "Keep this group" })
    .or(page.getByRole("status", { name: "Keep your sessions and get a calendar invite" }));
}

async function keepByCreatingAccount(page: Page, email: string) {
  await keepInvite(page).getByRole("button", { name: "Create account" }).click();
  const sheet = await fillAccount(page, email);
  await sheet.getByRole("button", { name: "Keep group" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("main").getByText("Kept in My groups")).toBeVisible();
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return await context.newPage();
}

async function accountClaiming(gm: Gm, name: string) {
  const { client } = await signUpAccount();
  await client.mutation(api.player.join, { shareToken: gm.shareToken, name });
}

test("a visitor keeps the Group with a new Account and plays as that Account on any device", async ({
  page,
  browser,
}) => {
  const first = await seedGroup("Thursday Crew");
  const second = await seedGroup("Sunday Table");
  const email = await reserveAccountSignUp();
  const elsewhere = await freshPage(browser);

  await test.step("the visitor answers, then keeps the Group by creating an Account", async () => {
    await page.goto(first.link);
    await join(page, "Ana");
    await expect(page.getByRole("region", { name: "Keep this group" })).toBeHidden();
    await answerToday(page);
    await expect(keepInvite(page)).toBeVisible();
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.getByRole("region", { name: "Keep this group" })).toBeVisible();
    await page.getByRole("button", { name: "Previous month" }).click();
    await keepByCreatingAccount(page, email);
    await expect(page.getByRole("button", { name: "Your account" })).toBeVisible();
  });

  await test.step("Remove keeps the Group out after another answer, and Undo restores it", async () => {
    await page.getByRole("button", { name: "Remove from my groups" }).click();
    await expect(page.getByRole("main").getByText("Kept in My groups")).toBeHidden();
    await todayTile(page).click();
    await expect(todayTile(page)).toHaveAccessibleName(/: Maybe$/);
    await expect(page.getByRole("main").getByText("Kept in My groups")).toBeHidden();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByRole("main").getByText("Kept in My groups")).toBeVisible();
    await page.goto("/me");
    await expect(page.getByRole("link", { name: /Thursday Crew/ })).toBeVisible();
    await page.goto(first.link);
    await todayTile(page).click();
    await todayTile(page).click();
    await answerToday(page);
  });

  await test.step("a second browser that logs in opens the Group as the same Player", async () => {
    await elsewhere.goto(first.link);
    await expect(elsewhere.getByRole("heading", { name: "Who are you?" })).toBeVisible();
    await logIn(elsewhere, email);
    await expect(elsewhere.getByText("Answering as")).toContainText("Ana");
    await expect(todayTile(elsewhere)).toHaveAccessibleName(/: Free$/);
    await expect(elsewhere.getByRole("main").getByText("Kept in My groups")).toBeVisible();
  });

  await test.step("joining a second Group with a new name keeps it at once", async () => {
    await elsewhere.goto(second.link);
    await join(elsewhere, "Bea");
    await expect(toastRegion(elsewhere)).toContainText("Kept in My groups");
    await expect(elsewhere.getByRole("main").getByText("Kept in My groups")).toBeVisible();
    await page.goto(second.link);
    await expect(page.getByText("Answering as")).toContainText("Bea");
  });

  await test.step("Not you? releases the claim and shows Join, and the Player stays on the Roster", async () => {
    await page.getByRole("button", { name: "Not you?" }).click();
    await expect(page.getByRole("heading", { name: "Who are you?" })).toBeVisible();
    await elsewhere.reload();
    await expect(elsewhere.getByText("Answering as")).toContainText("Bea");
    await expect(elsewhere.getByRole("main").getByText("Kept in My groups")).toBeHidden();
    const roster = await second.gm.client.query(api.player.group, {
      shareToken: second.gm.shareToken,
    });
    expect(roster?.players.map(({ name }) => name)).toEqual(["Bea"]);
  });

  await test.step("keeping the same Player again and saying Not you? again releases again", async () => {
    await page.getByRole("button", { name: "Bea" }).click();
    await answerToday(page);
    await expect(page.getByRole("main").getByText("Kept in My groups")).toBeVisible();
    await expect(elsewhere.getByRole("main").getByText("Kept in My groups")).toBeVisible();
    await page.getByRole("button", { name: "Not you?" }).click();
    await expect(elsewhere.getByRole("main").getByText("Kept in My groups")).toBeHidden();
    await expect(page.getByRole("heading", { name: "Who are you?" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Who are you?" })).toBeVisible();
  });
});

async function accountClaimingWithAnAnswer(gm: Gm, name: string) {
  const account = await signUpAccount();
  const playerId = await account.client.mutation(api.player.join, {
    shareToken: gm.shareToken,
    name,
  });
  await account.client.mutation(api.player.answer, {
    shareToken: gm.shareToken,
    playerId,
    date: todayUtc(Date.now()),
    answer: "free",
  });
  return account;
}

async function logInFromTheSheet(page: Page, email: string) {
  const sheet = await fillAccount(page, email);
  await sheet.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("a Claimed Player answers only through its Account, which logs in from the locked chip", async ({
  page,
  browser,
}) => {
  const { gm, link } = await seedGroup("Crowded Table");
  const dana = await accountClaimingWithAnAnswer(gm, "Dana");
  const stranger = await signUpAccount();
  const danasPhone = await freshPage(browser);

  await test.step("a visitor sees Dana locked and gets Log in when picking it", async () => {
    await page.goto(link);
    await page.getByRole("button", { name: "Dana, locked" }).click();
    await expect(page.getByRole("dialog", { name: "Log in" })).toBeVisible();
    await expect(page.getByText("Log in to answer as Dana.")).toBeVisible();
    await expect(page.getByText("Not Dana? Go back and pick your own name.")).toBeVisible();
  });

  await test.step("another Account that logs in reads that the name is kept", async () => {
    await logInFromTheSheet(page, stranger.email);
    await expect(
      page.getByText(
        "Another account keeps this name. Add yours with a last initial, or ask your GM.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Answering as")).toBeHidden();
  });

  await test.step("Dana's own Account logs in from the chip and answers as Dana", async () => {
    await danasPhone.goto(link);
    await danasPhone.getByRole("button", { name: "Dana, locked" }).click();
    await logInFromTheSheet(danasPhone, dana.email);
    await expect(danasPhone.getByText("Answering as")).toContainText("Dana");
    await expect(todayTile(danasPhone)).toHaveAccessibleName(/: Free$/);
  });
});

test("the GM unlocks a mistaken claim, and the Share Link answers as that name again", async ({
  page,
  browser,
}) => {
  const { gm, link } = await seedGroup("Shared Laptop");
  await accountClaimingWithAnAnswer(gm, "Dana");

  await test.step("the GM sees Dana locked on the Roster and unlocks it", async () => {
    await openAsGm(page, gm, `/g/${gm.groupId}`);
    const roster = page.getByRole("region", { name: /^Players/ });
    await expect(roster.getByRole("img", { name: "Kept by an account" })).toBeVisible();
    await roster.getByRole("button", { name: "More for Dana" }).click();
    await roster.getByRole("button", { name: "Unlock" }).click();
    await roster.getByRole("button", { name: "Unlock Dana" }).click();
    await expect(roster.getByRole("img", { name: "Kept by an account" })).toBeHidden();
  });

  await test.step("a signed-out visitor now picks Dana and sees Dana's answer", async () => {
    const visitor = await freshPage(browser);
    await visitor.goto(link);
    await visitor.getByRole("button", { name: "Dana", exact: true }).click();
    await expect(visitor.getByText("Answering as")).toContainText("Dana");
    await expect(todayTile(visitor)).toHaveAccessibleName(/: Free$/);
  });
});

test("an Anonymous GM saves their own Group first, then answers as their locked name", async ({
  page,
}) => {
  const { gm, link } = await seedGroup("Crowded Table");
  const dana = await accountClaimingWithAnAnswer(gm, "Dana");
  const own = await seedGroup("Dana's Table");

  await openAsGm(page, own.gm, link);
  await page.getByRole("button", { name: "Dana, locked" }).click();
  await expect(
    page.getByText(
      "Save your own group with the account that keeps Dana, then open this link again.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.goto(`/g/${own.gm.groupId}`);
  await page.getByRole("button", { name: "Save your group" }).click();
  const sheet = page.getByRole("dialog", { name: "Keep Dana's Table" });
  await sheet.getByText("I already have one").click();
  await fillAccount(page, dana.email);
  await sheet.getByRole("button", { name: "Log in and save" }).click();
  await expect(page.getByRole("button", { name: "Your account" })).toBeVisible();

  await page.goto(link);
  await expect(page.getByText("Answering as")).toContainText("Dana");
  await expect(todayTile(page)).toHaveAccessibleName(/: Free$/);
});

test("an Anonymous GM keeping their own link saves first, then keeps the Player", async ({
  page,
}) => {
  const { gm, link } = await seedGroup("Home Game");
  const email = await reserveAccountSignUp();

  await openAsGm(page, gm, link);
  await join(page, "Gus");
  await expect(page.getByRole("banner").getByRole("button", { name: "Log in" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Your account" })).toBeHidden();
  await answerToday(page);
  await page.getByRole("button", { name: "Keep this group" }).click();
  await expect(page.getByRole("dialog")).toContainText("Your own groups move to the account too.");
  const sheet = await fillAccount(page, email);
  await sheet.getByRole("button", { name: "Keep group" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("main").getByText("Kept in My groups")).toBeVisible();

  await page.goto(`/g/${gm.groupId}`);
  await expect(page.getByRole("button", { name: "Your account" })).toBeVisible();
});

test("a signed-out visitor still joins and answers in the same steps", async ({ page }) => {
  const { link } = await seedGroup("Open Table");

  await page.goto(link);
  await expect(page.getByRole("textbox")).toHaveCount(1);
  await join(page, "Eli");
  await expect(page.getByRole("dialog")).toBeHidden();
  await answerToday(page);

  await expect(page.getByRole("banner").getByRole("button", { name: "Log in" })).toBeVisible();
  await expect(page.getByText("Kept in My groups")).toBeHidden();
});

test("an Account can Keep again after removing a freshly joined Group before answering", async ({
  page,
}) => {
  const { gm, link } = await seedGroup("New Crew");
  const account = await signUpAccount();
  await openAsGm(page, account, link);
  await join(page, "Robin");
  await expect(page.getByRole("main").getByText("Kept in My groups")).toBeVisible();
  await page.getByRole("button", { name: "Remove from my groups" }).click();
  await expect(page.getByRole("main").getByText("Kept in My groups")).toBeHidden();
  await expect
    .poll(
      async () =>
        (await account.client.query(api.player.group, { shareToken: gm.shareToken }))
          ?.removedFromMyGroups,
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Keep this group", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Keep this group", exact: true }).click();
  await expect(page.getByRole("main").getByText("Kept in My groups")).toBeVisible();
});

for (const entry of ["player", "My groups"] as const) {
  test(`Remove from ${entry} cancels a leftover Keep before reload`, async ({ page }) => {
    const { gm, link } = await seedGroup("Removed Crew");
    const account = await signUpAccount();
    await openAsGm(page, account, link);
    await join(page, "Robin");
    await answerToday(page);
    const kept = await account.client.query(api.player.group, { shareToken: gm.shareToken });
    if (entry === "My groups") {
      await page.goto("/me");
      await page.getByRole("button", { name: "Options for Removed Crew" }).click();
    }
    await page.evaluate(
      (pending) => sessionStorage.setItem("next-session.pendingKeep", JSON.stringify(pending)),
      { shareToken: gm.shareToken, playerId: kept?.claimedPlayerId },
    );
    await page.getByRole("button", { name: "Remove from my groups" }).click();
    if (entry === "player")
      await expect(page.getByRole("main").getByText("Kept in My groups")).toBeHidden();
    else await expect(page.getByRole("link", { name: /Removed Crew/ })).toBeHidden();
    await expect
      .poll(
        async () =>
          (await account.client.query(api.player.group, { shareToken: gm.shareToken }))
            ?.removedFromMyGroups,
      )
      .toBe(true);
    await page.reload();
    await expect(
      page.getByRole("button", { name: entry === "player" ? "Your account" : "Log out" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => sessionStorage.getItem("next-session.pendingKeep")),
    ).toBeNull();
    expect(
      (await account.client.query(api.me.groups, { today: todayUtc(Date.now()) }))?.playing,
    ).toHaveLength(0);
  });
}

test("viewing and picking claim nothing; the first Fill the rest keeps the Player", async ({
  page,
}) => {
  const { gm, link } = await seedGroup("Friday Crew");
  await seedPlayer(gm, "Robin");
  const account = await signUpAccount();

  await openAsGm(page, account, link);
  await page.getByRole("button", { name: "Robin", exact: true }).click();
  expect(
    (await account.client.query(api.player.group, { shareToken: gm.shareToken }))?.claimedPlayerId,
  ).toBeNull();
  await page.getByRole("button", { name: /^Mark the other/ }).click();
  await expect(page.getByRole("main").getByText("Kept in My groups")).toBeVisible();
  await page.goto("/me");
  await expect(page.getByRole("link", { name: /Friday Crew/ })).toBeVisible();
});

test("the visitor can dismiss the nudge and keep answering during this visit", async ({ page }) => {
  const { link } = await seedGroup("Open Crew");
  const nextMonth = addMonths(monthOf(todayUtc(Date.now())), 1);
  const night = page.getByRole("button", {
    name: new RegExp(`^${dayLabel(`${nextMonth}-01`)}:`),
  });
  await page.goto(`${link}?month=${nextMonth}`);
  await join(page, "Eli");
  await expect(page.getByRole("region", { name: "Keep this group" })).toBeHidden();
  await night.click();
  await expect(night).toHaveAccessibleName(/: Free$/);
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await night.click();
  await expect(night).toHaveAccessibleName(/: Maybe$/);
  await expect(page.getByRole("region", { name: "Keep this group" })).toBeHidden();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("an Account at the 50 Group cap still answers, and an explicit keep explains the cap", async ({
  page,
}) => {
  test.setTimeout(90_000);
  let account: Awaited<ReturnType<typeof signUpAccount>> | undefined;
  await expect(async () => {
    account = await signUpAccount();
  }).toPass({ timeout: 30_000, intervals: [2000] });
  if (account === undefined) throw new Error("The test Account was not created");
  for (let owner = 0; owner < 10; owner++) {
    const gm = await signInAnonymousGm();
    for (let group = 0; group < 5; group++) {
      const token =
        group === 0
          ? gm.shareToken
          : await shareTokenOf(gm.client, await gm.client.mutation(api.groups.create, {}));
      await account.client.mutation(api.player.join, { shareToken: token, name: "Robin" });
    }
  }
  const { gm, link } = await seedGroup("One more crew");
  await seedPlayer(gm, "Robin");
  await openAsGm(page, account, link);
  await page.getByRole("button", { name: "Robin", exact: true }).click();
  await answerToday(page);
  await expect(page.getByRole("main").getByText("Kept in My groups")).toBeHidden();
  await page.getByRole("button", { name: "Keep this group", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("50");
  expect(
    (await account.client.query(api.me.groups, { today: todayUtc(Date.now()) }))?.playing,
  ).toHaveLength(50);
});

const screenshotDir = process.env.E2E_SCREENSHOTS;

test.describe("screenshots", () => {
  test.skip(!screenshotDir, "Set E2E_SCREENSHOTS to a directory to capture them");

  for (const width of [390, 1440]) {
    test(`locked name states at ${String(width)}px`, async ({ browser }) => {
      const { gm, link } = await seedGroup("Long Table");
      const dana = await accountClaimingWithAnAnswer(gm, "Dana");
      for (const index of Array.from({ length: 12 }, (_, i) => i + 1)) {
        await seedPlayer(gm, `Guest ${String(index)}`);
      }
      const viewport = { width, height: width < 640 ? 844 : 1000 };
      const shot = (page: Page, name: string) =>
        page.screenshot({
          path: `${screenshotDir ?? ""}/${name}--${String(width)}--light.png`,
          fullPage: true,
          animations: "disabled",
        });
      const fresh = async () => {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        await page.addInitScript((groupId) => {
          localStorage.setItem(`next-session.playerHint.${groupId}`, "1");
          localStorage.setItem("next-session.othersIntroSeen", "1");
        }, gm.groupId);
        return page;
      };

      const remembering = await fresh();
      await remembering.goto(link);
      await remembering.getByRole("searchbox", { name: "Find your name" }).fill("Dana");
      await remembering.getByRole("button", { name: "Dana, locked" }).click();
      await remembering
        .getByRole("dialog", { name: "Log in" })
        .getByRole("button", { name: "Close" })
        .click();
      await remembering.reload();
      await expect(remembering.getByText("Log in to answer as Dana.")).toBeVisible();
      await shot(remembering, "locked-remembered");
      await remembering.getByRole("searchbox", { name: "Find your name" }).fill("Dev");
      await expect(remembering.getByText("No names match. Add yours below.")).toBeVisible();
      await shot(remembering, "locked-search-no-match");

      const anonymousGm = await fresh();
      const own = await seedGroup("Dana's Table");
      await openAsGm(anonymousGm, own.gm, link);
      await anonymousGm.getByRole("searchbox", { name: "Find your name" }).fill("Dana");
      await anonymousGm.getByRole("button", { name: "Dana, locked" }).click();
      await expect(anonymousGm.getByText(/account that keeps Dana/)).toBeVisible();
      await shot(anonymousGm, "locked-anonymous-gm");

      const owner = await fresh();
      await owner.goto(link);
      await owner.getByRole("searchbox", { name: "Find your name" }).fill("Dana");
      await owner.getByRole("button", { name: "Dana, locked" }).click();
      await logInFromTheSheet(owner, dana.email);
      await expect(owner.getByText("Answering as")).toContainText("Dana");
      await shot(owner, "locked-owner-answering");

      const gmPage = await fresh();
      await openAsGm(gmPage, gm, `/g/${gm.groupId}`);
      if (width < 640) await gmPage.getByRole("tab", { name: "Players" }).click();
      const roster = gmPage.getByRole("region", { name: /^Players/ });
      await expect(roster.getByRole("img", { name: "Kept by an account" })).toBeVisible();
      await shot(gmPage, "locked-gm-roster");
      await roster.getByRole("button", { name: "More for Dana" }).click();
      await expect(roster.getByRole("button", { name: "Unlock" })).toBeVisible();
      await shot(gmPage, "locked-gm-actions");
      await roster.getByRole("button", { name: "Unlock" }).click();
      await expect(roster.getByRole("button", { name: "Unlock Dana" })).toBeVisible();
      await shot(gmPage, "locked-gm-unlock-confirm");
    });
  }

  for (const width of [390, 1440]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${String(width)}px ${colorScheme}`, async ({ browser }) => {
        const { gm, link } = await seedGroup("Thursday Crew");
        await accountClaiming(gm, "Dana");
        const context = await browser.newContext({
          viewport: { width, height: width < 640 ? 844 : 1000 },
          colorScheme,
        });
        const page = await context.newPage();
        await page.addInitScript((groupId) => {
          localStorage.setItem(`next-session.playerHint.${groupId}`, "1");
          localStorage.setItem("next-session.othersIntroSeen", "1");
        }, gm.groupId);
        const shot = (name: string) =>
          page.screenshot({
            path: `${screenshotDir ?? ""}/${name}--${String(width)}--${colorScheme}.png`,
            fullPage: true,
            animations: "disabled",
          });

        await page.goto(link);
        await join(page, "Ana");
        await answerToday(page);
        await shot("keep-this-group");

        await keepByCreatingAccount(page, await reserveAccountSignUp());
        await expect(toastRegion(page)).toBeEmpty({ timeout: 10_000 });
        await shot("kept-with-remove");

        await page.getByRole("button", { name: "Remove from my groups" }).click();
        await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
        await expect(page.getByRole("main").getByText("Kept in My groups")).toBeHidden();
        await shot("removed-with-undo");
        await page.getByRole("button", { name: "Undo", exact: true }).click();
        await expect(page.getByRole("main").getByText("Kept in My groups")).toBeVisible();

        await page.getByRole("button", { name: "Not you?" }).click();
        await page.getByRole("button", { name: "Dana, locked" }).click();
        await expect(
          page.getByText("Another account keeps this name.", { exact: false }),
        ).toBeVisible();
        await shot("player-claimed");

        const visitorContext = await browser.newContext({
          viewport: { width, height: width < 640 ? 844 : 1000 },
          colorScheme,
        });
        const visitor = await visitorContext.newPage();
        await visitor.goto(link);
        await visitor.getByRole("button", { name: "Dana, locked" }).click();
        await expect(visitor.getByRole("dialog", { name: "Log in" })).toBeVisible();
        await visitor.screenshot({
          path: `${screenshotDir ?? ""}/player-locked-log-in--${String(width)}--${colorScheme}.png`,
          animations: "disabled",
        });
        await visitorContext.close();
      });
    }
  }
});
