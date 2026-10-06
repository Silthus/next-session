import { randomBytes } from "node:crypto";
import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { addMonths, monthOf, todayUtc, type IsoDate } from "../shared/dates";
import { toastRegion } from "./helpers";

const lonirUrl = "https://little-spaniel-709.convex.site";
const legacyShareLink = "/s/AAAAAAAA";

const stamp = Date.now();
const groupName = `Prod proof ${String(stamp)}`;
const playerName = `Proof Player ${String(stamp)}`;
const email = `prod-proof+${String(stamp)}@example.test`;
const password = randomBytes(18).toString("base64url");

const nextMonth = addMonths(monthOf(todayUtc(stamp)), 1);
const dateOf = (day: number): IsoDate => `${nextMonth}-${String(day).padStart(2, "0")}`;

function dayLabel(date: IsoDate) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

const night = (page: Page, date: IsoDate) =>
  page.getByRole("button", { name: new RegExp(`^${dayLabel(date)}: `) });
const switcher = (page: Page) =>
  page.getByRole("heading", { level: 1 }).getByRole("button", { name: groupName });
const rail = (page: Page) => page.getByRole("complementary", { name: "Group overview" });
const myGroupsSection = (page: Page, name: string) => page.getByRole("region", { name });
const playingCard = (page: Page) =>
  myGroupsSection(page, "You play in").getByRole("listitem").filter({ hasText: groupName });

let leftoverGroup: { gm: Page; path: string } | undefined;

test.afterEach(async () => {
  if (leftoverGroup) await deleteGroup(leftoverGroup.gm, leftoverGroup.path);
});

async function deleteGroup(gm: Page, groupPath: string) {
  await gm.goto(groupPath);
  await expect(rail(gm).getByRole("button", { name: "Copy" })).toBeVisible();
  await gm.getByRole("heading", { level: 1 }).getByRole("button").click();
  await gm.getByRole("button", { name: "Delete group" }).click();
  await gm
    .getByRole("group", { name: /^Delete .*\?$/ })
    .getByRole("button", { name: /^Delete / })
    .click();
  await expect(gm).toHaveURL(new RegExp(`^${new URL("/", gm.url()).href}(me)?$`));
  leftoverGroup = undefined;
}

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function tapUntil(page: Page, date: IsoDate, answer: "Free" | "Maybe") {
  await night(page, date).click();
  if (answer === "Maybe") {
    await expect(night(page, date)).toHaveAccessibleName(`${dayLabel(date)}: Free`);
    await night(page, date).click();
  }
  await expect(night(page, date)).toHaveAccessibleName(`${dayLabel(date)}: ${answer}`);
}

async function newContextKnowingPassword(browser: Browser) {
  const context = await browser.newContext();
  await context.exposeFunction("proofPassword", () => password);
  return context;
}

async function enterPasswordUnrecorded(field: Locator) {
  await field.evaluate(async (input: HTMLInputElement) => {
    const proof = window as unknown as { proofPassword: () => Promise<string> };
    Reflect.set(HTMLInputElement.prototype, "value", await proof.proofPassword(), input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function clearPasswordsLeftOnScreen(field: Locator) {
  await field.evaluateAll((inputs: HTMLInputElement[]) => {
    for (const input of inputs) {
      Reflect.set(HTMLInputElement.prototype, "value", "", input);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

async function submitCredentials(page: Page, dialogName: string, submitLabel: string) {
  const sheet = page.getByRole("dialog", { name: dialogName });
  await sheet.getByLabel("Email").fill(email);
  await enterPasswordUnrecorded(sheet.getByLabel("Password"));
  await sheet.getByRole("button", { name: submitLabel }).click();
  await clearPasswordsLeftOnScreen(sheet.getByLabel("Password"));
}

async function expectBar(page: Page, date: IsoDate, answer: "free" | "maybe") {
  await expect(night(page, date).locator("[data-bar]")).toHaveAttribute("data-bar", answer);
}

test("a GM and a Player schedule a Session on the deployed app", async ({
  browser,
  request,
}, testInfo) => {
  const appOrigin = new URL(testInfo.project.use.baseURL ?? "").origin;
  const gm = await (await newContextKnowingPassword(browser)).newPage();
  let shareLinkShown = "";
  let groupPath = "";

  await test.step("1. Create your link shows the Share Link in place", async () => {
    expect((await request.get("/", { maxRedirects: 0 })).status()).toBe(200);
    await gm.goto("/");
    expect(new URL(gm.url()).origin).toBe(appOrigin);
    await gm.getByRole("button", { name: "Create your link" }).click();
    await expect(gm.getByText("Your link is ready. Send it to your players.")).toBeVisible();
    groupPath =
      (await gm.getByRole("link", { name: "Open your group →" }).getAttribute("href")) ?? "";
    leftoverGroup = { gm, path: groupPath };
    await expect(gm.locator("code")).toHaveText(/\/s\/[A-Za-z0-9_-]{10}$/);
    shareLinkShown = (await gm.locator("code").textContent()) ?? "";
    expect(new URL(`https://${shareLinkShown}`).origin).toBe(appOrigin);
    await shoot(gm, testInfo, "1-link-created");
  });

  await test.step("2. The GM opens the Group and renames it", async () => {
    await gm.getByRole("link", { name: "Open your group →" }).click();
    await expect(gm).toHaveURL(groupPath);
    await expect(rail(gm).locator("code")).toHaveText(shareLinkShown);
    await gm.getByRole("heading", { level: 1 }).getByRole("button", { name: "My group" }).click();
    await gm.getByRole("button", { name: "Rename group" }).click();
    await gm.getByRole("textbox", { name: "Group name" }).fill(groupName);
    await gm.keyboard.press("Enter");
    await expect(switcher(gm)).toBeVisible();
    await shoot(gm, testInfo, "2-group-renamed");
  });

  const playerContext = await newContextKnowingPassword(browser);
  const player = await playerContext.newPage();

  await test.step("3. A Player joins from the Share Link and answers", async () => {
    await player.goto(`https://${shareLinkShown}?month=${nextMonth}`);
    await expect(player.getByRole("heading", { level: 1, name: groupName })).toBeVisible();
    await player.getByRole("textbox", { name: "Your name", exact: true }).fill(playerName);
    await player.getByRole("button", { name: "Join" }).click();
    await expect(player.getByText("Answering as")).toContainText(playerName);
    await tapUntil(player, dateOf(5), "Free");
    await tapUntil(player, dateOf(6), "Free");
    await tapUntil(player, dateOf(7), "Maybe");
    await shoot(player, testInfo, "3-player-answered");
  });

  await test.step("4. The GM schedules a free night and the Player sees it", async () => {
    await gm.goto(`${groupPath}?month=${nextMonth}`);
    await expect(night(gm, dateOf(5))).toHaveAccessibleName(
      `${dayLabel(dateOf(5))}: everyone free`,
    );
    await expect(night(gm, dateOf(6))).toHaveAccessibleName(
      `${dayLabel(dateOf(6))}: everyone free`,
    );
    await expect(night(gm, dateOf(7))).toHaveAccessibleName(
      `${dayLabel(dateOf(7))}: 0 free, 1 maybe, 0 busy`,
    );
    await expectBar(gm, dateOf(5), "free");
    await expectBar(gm, dateOf(6), "free");
    await expectBar(gm, dateOf(7), "maybe");
    await night(gm, dateOf(5)).click();
    const dayPanel = gm.getByRole("region", { name: dayLabel(dateOf(5)) });
    await expect(dayPanel.getByRole("listitem")).toHaveText([new RegExp(`${playerName}.*Free`)]);
    await dayPanel.getByRole("button", { name: "Schedule session" }).click();
    await expect(toastRegion(gm)).toContainText("Players see it on the link.");
    await expect(night(gm, dateOf(5))).toHaveAccessibleName(
      `${dayLabel(dateOf(5))}: everyone free, Session scheduled`,
    );
    await shoot(gm, testInfo, "4-gm-session-scheduled");
    await expect(night(player, dateOf(5))).toHaveAccessibleName(
      `${dayLabel(dateOf(5))}: Free, Session`,
    );
    await shoot(player, testInfo, "4-player-sees-session");
  });

  await test.step("5. The GM saves to a new Account, and a third browser logs in", async () => {
    await gm.getByRole("button", { name: "Save your group" }).click();
    await submitCredentials(gm, `Keep ${groupName}`, "Save group");
    await expect(toastRegion(gm)).toHaveText("Saved. Open it anywhere with your account.");
    await expect(gm.getByRole("button", { name: "Your account" })).toBeVisible();
    await shoot(gm, testInfo, "5-gm-saved");

    const elsewhereContext = await newContextKnowingPassword(browser);
    const elsewhere = await elsewhereContext.newPage();
    await elsewhere.goto("/");
    await elsewhere.getByRole("button", { name: "Log in" }).click();
    await submitCredentials(elsewhere, "Log in", "Log in");
    await expect(elsewhere).toHaveURL(groupPath);
    await expect(switcher(elsewhere)).toBeVisible();
    await expect(rail(elsewhere).locator("code")).toHaveText(shareLinkShown);
    await shoot(elsewhere, testInfo, "5-logged-in-elsewhere");
    await elsewhereContext.close();
  });

  await test.step("6. A legacy Share Link answers 302 to Lonir", async () => {
    const response = await request.get(legacyShareLink, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe(`${lonirUrl}${legacyShareLink}`);
  });

  await test.step("7. The Player keeps the Group and finds it in My groups", async () => {
    await player.getByRole("banner").getByRole("button", { name: "Log in" }).click();
    await submitCredentials(player, "Log in", "Log in");
    await expect(player.getByRole("button", { name: "Your account" })).toBeVisible();
    await player.getByRole("button", { name: "Keep this group" }).click();
    await expect(player.getByRole("main").getByText("Kept in My groups")).toBeVisible();
    await shoot(player, testInfo, "7-player-kept");

    await player.getByRole("button", { name: "Your account" }).click();
    await player.getByRole("link", { name: "My groups" }).click();
    await expect(player).toHaveURL(new URL("/me", appOrigin).href);
    await expect(myGroupsSection(player, "Next sessions").getByRole("link")).toHaveText([
      new RegExp(`^${dayLabel(dateOf(5))}.*${groupName}$`),
    ]);
    await expect(playingCard(player)).toContainText(`as ${playerName}`);
    await expect(myGroupsSection(player, "You run").getByRole("link")).toContainText(groupName);
    await shoot(player, testInfo, "7-my-groups");

    await player.getByRole("button", { name: `Options for ${groupName}` }).click();
    await player.getByRole("button", { name: "Remove from my groups" }).click();
    await expect(playingCard(player)).toHaveCount(0);
    await toastRegion(player).getByRole("button", { name: "Undo" }).click();
    await expect(toastRegion(player)).toContainText(`${groupName} is back in My groups.`);
    await expect(playingCard(player)).toHaveCount(1);
    await shoot(player, testInfo, "7-my-groups-undone");
  });

  await test.step("8. The GM deletes the Group", async () => {
    await deleteGroup(gm, groupPath);
    await player.goto(`https://${shareLinkShown}`);
    await expect(player.getByRole("heading", { name: "This link no longer works" })).toBeVisible();
    await shoot(player, testInfo, "8-link-gone");
  });
});
