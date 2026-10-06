import { devices, expect, test, type Page } from "@playwright/test";
import { openAsGm, signInAnonymousGm } from "./helpers";

test.use({ ...devices["Pixel 7"] });

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read"]);
});

async function expectTapToCopy(page: Page, shareToken: string) {
  await page.getByRole("button", { name: "Copy" }).tap();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect(page.getByText("Long-press the link to copy it.")).toBeHidden();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `http://localhost:5173/s/${shareToken}`,
  );
}

test("a phone that refuses clipboard writes still copies the new link on the landing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your link" }).tap();
  await expect(page.getByText("Your link is ready. Send it to your players.")).toBeVisible();
  const shareLink = (await page.locator("code").textContent()) ?? "";

  await expectTapToCopy(page, shareLink.split("/s/")[1] ?? "");
});

test("a phone that refuses clipboard writes still copies the link from the group", async ({
  page,
}) => {
  const gm = await signInAnonymousGm();
  await openAsGm(page, gm, `/g/${gm.groupId}`);
  await expect(page.getByText(`/s/${gm.shareToken}`)).toBeVisible();

  await expectTapToCopy(page, gm.shareToken);
});
