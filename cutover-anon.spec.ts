import { expect, test, type Page, type TestInfo } from "@playwright/test";

const shots = "/home/coder/dev/ns-worktrees/ticket-22-artifacts/screenshots";
const rail = (page: Page) => page.getByRole("complementary", { name: "Group overview" });

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true, animations: "disabled" });
}

test("anonymous cutover check on the apex", async ({ browser }, testInfo: TestInfo) => {
  const appOrigin = new URL(testInfo.project.use.baseURL ?? "").origin;
  const gm = await (await browser.newContext()).newPage();
  const authCalls: string[] = [];
  gm.on("response", (r) => {
    if (/auth|signIn/i.test(r.url()) || /auth:signIn/.test(r.request().postData() ?? ""))
      authCalls.push(`${r.status()} ${new URL(r.url()).host}${new URL(r.url()).pathname}`);
  });

  await gm.goto("/");
  expect(new URL(gm.url()).origin).toBe(appOrigin);
  await expect(gm.getByRole("button", { name: "Create your link" })).toBeVisible();
  await shoot(gm, "landing");

  await gm.getByRole("button", { name: "Create your link" }).click();
  await expect(gm.getByText("Your link is ready. Send it to your players.")).toBeVisible();
  const groupPath = (await gm.getByRole("link", { name: "Open your group →" }).getAttribute("href")) ?? "";
  await expect(gm.locator("code")).toHaveText(/\/s\/[A-Za-z0-9_-]{10}$/);
  const shareLink = `https://${(await gm.locator("code").textContent()) ?? ""}`;
  expect(new URL(shareLink).origin).toBe(appOrigin);
  await shoot(gm, "link-created");
  const authKeys = await gm.evaluate(() => Object.keys(localStorage).filter((k) => /auth/i.test(k)));
  console.log("share token length", new URL(shareLink).pathname.length - 3, "group path", groupPath.replace(/[^/]+$/, "<id>"));
  console.log("auth localStorage keys", JSON.stringify(authKeys.map((k) => k.replace(/_[^_]*$/, "_…"))));

  const player = await (await browser.newContext()).newPage();
  const res = await player.goto(shareLink);
  console.log("share link status", res?.status());
  await expect(player.getByRole("heading", { level: 1, name: "My group" })).toBeVisible();
  await expect(player.getByRole("textbox", { name: "Your name", exact: true })).toBeVisible();
  await shoot(player, "player-join");
  await player.getByRole("textbox", { name: "Your name", exact: true }).fill("Cutover check");
  await player.getByRole("button", { name: "Join" }).click();
  await expect(player.getByText("Answering as")).toContainText("Cutover check");
  await shoot(player, "player-joined");

  await gm.goto(groupPath);
  await expect(rail(gm).getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(rail(gm)).toContainText("Cutover check");
  await shoot(gm, "gm-group");
  await gm.getByRole("heading", { level: 1 }).getByRole("button").click();
  await gm.getByRole("button", { name: "Delete group" }).click();
  await gm.getByRole("group", { name: /^Delete .*\?$/ }).getByRole("button", { name: /^Delete / }).click();
  await expect(gm).toHaveURL(new URL("/", gm.url()).href);
  const gone = await (await browser.newContext()).newPage();
  await gone.goto(shareLink);
  await expect(gone.getByRole("textbox", { name: "Your name", exact: true })).toHaveCount(0);
  console.log("auth calls", JSON.stringify([...new Set(authCalls)]));
});
