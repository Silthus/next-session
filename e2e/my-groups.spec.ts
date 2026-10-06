import { expect, test, type Page } from "@playwright/test";
import { api } from "../convex/_generated/api";
import { addMonths, monthOf, todayUtc, type IsoDate } from "../shared/dates";
import { openAsGm, seedPlayer, signInAnonymousGm, signUpAccount, toastRegion } from "./helpers";

const today = todayUtc(Date.now());
const nextMonth = addMonths(monthOf(today), 1);
const sessionDate: IsoDate = `${nextMonth}-10`;

async function seedGroup(name: string) {
  const gm = await signInAnonymousGm();
  await gm.client.mutation(api.groups.rename, { groupId: gm.groupId, name });
  return { gm, link: `/s/${gm.shareToken}` };
}

function longDay(date: IsoDate) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function todayTile(page: Page) {
  return page.getByRole("button", { name: new RegExp(`^${longDay(today)}:`) });
}

function section(page: Page, name: string) {
  return page.getByRole("region", { name });
}

function playingCard(page: Page, groupName: string) {
  return section(page, "You play in").getByRole("listitem").filter({ hasText: groupName });
}

async function removeFromMyGroups(page: Page, groupName: string) {
  await page.getByRole("button", { name: `Options for ${groupName}` }).click();
  await page.getByRole("button", { name: "Remove from my groups" }).click();
}

test("an Account sees every Group it plays in and the Sessions across them on /me", async ({
  page,
}) => {
  const thursday = await seedGroup("Thursday Crew");
  const sunday = await seedGroup("Sunday Table");
  await seedPlayer(thursday.gm, "Robin");
  const account = await signUpAccount();

  await test.step("an Account without Groups lands on My groups", async () => {
    await openAsGm(page, account, "/");
    await expect(page).toHaveURL("/me");
    await expect(page.getByText("Open your GM's link and tap Keep this group.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create your link" })).toBeVisible();
    await expect(page).toHaveTitle("My groups · Next Session");
  });

  await test.step("it keeps one Group and joins a second through its link", async () => {
    await page.goto(thursday.link);
    await page.getByRole("button", { name: "Robin", exact: true }).click();
    await todayTile(page).click();
    await expect(todayTile(page)).toHaveAccessibleName(/: Free$/);
    await page.getByRole("button", { name: "Keep this group" }).click();
    await expect(page.getByRole("main").getByText("Kept in My groups")).toBeVisible();

    await page.goto(sunday.link);
    await page.getByRole("textbox", { name: /Your name/ }).fill("Rob");
    await page.getByRole("button", { name: "Join" }).click();
    await expect(toastRegion(page)).toContainText("Kept in My groups");
  });

  await test.step("the second GM schedules a Session, and My groups shows both Groups and it", async () => {
    await sunday.gm.client.mutation(api.sessions.schedule, {
      groupId: sunday.gm.groupId,
      date: sessionDate,
    });
    await page.getByRole("button", { name: "Your account" }).click();
    await page.getByRole("link", { name: "My groups" }).click();
    await expect(page).toHaveURL("/me");

    await expect(section(page, "Next sessions").getByRole("link")).toHaveText([
      new RegExp(`^${longDay(sessionDate)}.*Sunday Table$`),
    ]);
    await expect(playingCard(page, "Thursday Crew")).toContainText("as Robin");
    await expect(playingCard(page, "Thursday Crew")).toContainText("No session yet");
    await expect(playingCard(page, "Thursday Crew")).toContainText(/\d+ days to answer/);
    await expect(playingCard(page, "Sunday Table")).toContainText("as Rob");
    await expect(
      section(page, "You run").getByRole("button", { name: "Create your link" }),
    ).toBeVisible();
  });

  await test.step("a card opens the player page as the Claimed Player", async () => {
    await playingCard(page, "Sunday Table").getByRole("link").click();
    await expect(page).toHaveURL(sunday.link);
    await expect(page.getByText("Answering as")).toContainText("Rob");
    await page.goBack();
    await expect(page).toHaveURL("/me");
  });

  await test.step("Remove from my groups takes Undo, and the Player stays on the Roster", async () => {
    await removeFromMyGroups(page, "Thursday Crew");
    await expect(playingCard(page, "Thursday Crew")).toHaveCount(0);
    await expect(toastRegion(page)).toContainText("Removed Thursday Crew from My groups.");
    await toastRegion(page).getByRole("button", { name: "Undo" }).click();
    await expect(playingCard(page, "Thursday Crew")).toHaveCount(1);
    await expect(toastRegion(page)).toContainText("Thursday Crew is back in My groups.");

    await removeFromMyGroups(page, "Thursday Crew");
    await expect(playingCard(page, "Thursday Crew")).toHaveCount(0);
    await expect
      .poll(async () => {
        const groups = await account.client.query(api.me.groups, { today });
        return groups?.playing.map(({ name }) => name);
      })
      .toEqual(["Sunday Table"]);
    await page.reload();
    await expect(playingCard(page, "Sunday Table")).toHaveCount(1);
    await expect(playingCard(page, "Thursday Crew")).toHaveCount(0);
    const roster = await thursday.gm.client.query(api.schedule.month, {
      groupId: thursday.gm.groupId,
      month: monthOf(today),
    });
    expect(roster?.players.map(({ name }) => name)).toEqual(["Robin"]);
  });

  await test.step("Log out leaves My groups", async () => {
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });
});

async function watchForMyGroupsPage(page: Page) {
  await page.addInitScript(() => {
    const record = window as unknown as { sawMyGroupsPage: boolean };
    record.sawMyGroupsPage = false;
    new MutationObserver(() => {
      if (document.querySelector("h1")?.textContent === "My groups") record.sawMyGroupsPage = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  return () =>
    page.evaluate(() => (window as unknown as { sawMyGroupsPage: boolean }).sawMyGroupsPage);
}

test("/me sends anyone but an Account away without showing them the page", async ({ page }) => {
  const sawMyGroupsPage = await watchForMyGroupsPage(page);

  await page.goto("/me");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "Create your link" })).toBeVisible();
  expect(await sawMyGroupsPage()).toBe(false);

  const gm = await signInAnonymousGm();
  await openAsGm(page, gm, "/me");
  await expect(page).toHaveURL(`/g/${gm.groupId}`);
  expect(await sawMyGroupsPage()).toBe(false);
});
