import { expect, test, type Page } from "@playwright/test";
import { openAsGm, signInAnonymousGm } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read"]);
  await context.addInitScript(() => {
    navigator.clipboard.writeText = () =>
      Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
  });
});

async function expectTapToCopy(page: Page, shareToken: string) {
  await page.getByRole("button", { name: "Copy" }).tap();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect(page.getByText("Long-press the link to copy it.")).toBeHidden();
  await expect(page.locator("textarea")).toHaveCount(0);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${new URL(page.url()).origin}/s/${shareToken}`,
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

test("a phone offers a selectable link when both clipboard methods refuse", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    document.execCommand = () => false;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create your link" }).tap();
  await expect(page.getByText("Your link is ready. Send it to your players.")).toBeVisible();
  await page.getByRole("button", { name: "Copy", exact: true }).tap();
  await expect(page.getByText("Long-press the link to copy it.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copied" })).toBeHidden();
  await expect(page.locator("code")).toHaveCSS("user-select", "all");
  await expect(page.locator("textarea")).toHaveCount(0);
});

test("a phone shares its invitation and link through the native share sheet", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      value: (data: ShareData) => {
        document.body.dataset.sharedText = data.text;
        return Promise.resolve();
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create your link" }).tap();
  await expect(page.getByText("Your link is ready. Send it to your players.")).toBeVisible();
  const link = `http://${await page.locator("code").textContent()}`;
  await expect(page.getByRole("link", { name: "Share via WhatsApp" })).toHaveAttribute(
    "href",
    `https://wa.me/?text=${encodeURIComponent(`Help me find our next game night. Tap the days you can play, it takes 30 seconds: ${link}`)}`,
  );
  await page.getByRole("button", { name: "Share", exact: true }).tap();
  await expect(page.locator("body")).toHaveAttribute(
    "data-shared-text",
    `Help me find our next game night. Tap the days you can play, it takes 30 seconds: ${link}`,
  );
});
