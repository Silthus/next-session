import { randomBytes } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { addMonths, monthOf, todayUtc, type IsoDate } from "../shared/dates";

const lonirUrl = "https://little-spaniel-709.convex.site";
const legacyShareLink = "/s/AAAAAAAA";

const stamp = Date.now();
const groupName = `Prod proof ${String(stamp)}`;
const playerName = `Proof Player ${String(stamp)}`;
const email = `prod-proof+${String(stamp)}@next-session.link`;
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

async function fillCredentials(page: Page, dialogName: string | RegExp) {
  const sheet = page.getByRole("dialog", { name: dialogName });
  await sheet.getByLabel("Email").fill(email);
  await sheet.getByLabel("Password").fill(password);
  return sheet;
}

test("a GM and a Player schedule a Session on the deployed app", async ({
  browser,
  request,
}, testInfo) => {
  const appOrigin = new URL(testInfo.project.use.baseURL ?? "").origin;
  const gmContext = await browser.newContext();
  const gm = await gmContext.newPage();
  let shareLink = "";

  await test.step("1. Create your link shows the Share Link in place", async () => {
    await gm.goto("/");
    expect(new URL(gm.url()).origin).toBe(appOrigin);
    await gm.getByRole("button", { name: "Create your link" }).click();
    await expect(gm.getByText("Your link is ready. Send it to your players.")).toBeVisible();
    await expect(gm.locator("code")).toHaveText(/\/s\/[A-Za-z0-9_-]{10}$/);
    shareLink = new URL(`https://${(await gm.locator("code").textContent()) ?? ""}`).pathname;
    await shoot(gm, testInfo, "1-link-created");
  });

  await test.step("2. The GM opens the Group and renames it", async () => {
    await gm.getByRole("link", { name: "Open your group →" }).click();
    await expect(gm).toHaveURL(/\/g\/\w+$/);
    await gm.getByRole("heading", { level: 1 }).getByRole("button", { name: "My group" }).click();
    await gm.getByRole("button", { name: "Rename group" }).click();
    await gm.getByRole("textbox", { name: "Group name" }).fill(groupName);
    await gm.keyboard.press("Enter");
    await expect(switcher(gm)).toBeVisible();
    await expect(rail(gm).getByText(shareLink)).toBeVisible();
    await shoot(gm, testInfo, "2-group-renamed");
  });

  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();

  await test.step("3. A Player joins from the Share Link and answers", async () => {
    await player.goto(`${shareLink}?month=${nextMonth}`);
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
    await gm.getByRole("button", { name: "Next month" }).click();
    await expect(gm).toHaveURL(new RegExp(`month=${nextMonth}`));
    await expect(night(gm, dateOf(5))).toHaveAccessibleName(
      `${dayLabel(dateOf(5))}: everyone free`,
    );
    await expect(night(gm, dateOf(6))).toHaveAccessibleName(
      `${dayLabel(dateOf(6))}: everyone free`,
    );
    await expect(night(gm, dateOf(7))).toHaveAccessibleName(
      `${dayLabel(dateOf(7))}: 0 free, 1 maybe, 0 busy`,
    );
    await night(gm, dateOf(5)).click();
    const dayPanel = gm.getByRole("region", { name: dayLabel(dateOf(5)) });
    await expect(dayPanel.getByRole("listitem")).toHaveText([new RegExp(`${playerName}.*Free`)]);
    await dayPanel.getByRole("button", { name: "Schedule session" }).click();
    await expect(gm.getByRole("status")).toContainText("Players see it on the link.");
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
    const groupPath = new URL(gm.url()).pathname;
    await gm.getByRole("button", { name: "Save your group" }).click();
    const sheet = await fillCredentials(gm, `Keep ${groupName}`);
    await sheet.getByRole("button", { name: "Save group" }).click();
    await expect(gm.getByRole("status")).toHaveText("Saved. Open it anywhere with your account.");
    await expect(gm.getByRole("button", { name: "Your account" })).toBeVisible();
    await shoot(gm, testInfo, "5-gm-saved");

    const elsewhereContext = await browser.newContext();
    const elsewhere = await elsewhereContext.newPage();
    await elsewhere.goto("/");
    await elsewhere.getByRole("button", { name: "Log in" }).click();
    const logIn = await fillCredentials(elsewhere, "Log in");
    await logIn.getByRole("button", { name: "Log in" }).click();
    await expect(elsewhere).toHaveURL(groupPath);
    await expect(switcher(elsewhere)).toBeVisible();
    await expect(rail(elsewhere).getByText(shareLink)).toBeVisible();
    await shoot(elsewhere, testInfo, "5-logged-in-elsewhere");
    await elsewhereContext.close();
  });

  await test.step("6. A legacy Share Link answers 302 to Lonir", async () => {
    const response = await request.get(legacyShareLink, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe(`${lonirUrl}${legacyShareLink}`);
  });

  await test.step("7. The GM deletes the Group", async () => {
    await switcher(gm).click();
    await gm.getByRole("button", { name: "Delete group" }).click();
    await gm.getByRole("button", { name: `Delete ${groupName}` }).click();
    await expect(gm).toHaveURL(`${appOrigin}/`);
    await player.reload();
    await expect(player.getByRole("heading", { name: "This link no longer works" })).toBeVisible();
    await shoot(player, testInfo, "7-link-gone");
  });
});
