import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(process.argv[3]!);
const { chromium, expect } = await import(
  `${repo}/node_modules/@playwright/test/index.mjs`
);
const { ConvexHttpClient } = await import(
  `${repo}/node_modules/convex/dist/esm/browser/index.js`
);
const { api } = await import(`${repo}/convex/_generated/api.js`);

const out = process.argv[2]!;
mkdirSync(out, { recursive: true });
const site = "https://next-session.link";
const convexUrl = "https://pleasant-sockeye-672.convex.cloud";
const suffix = convexUrl.replace(/[^a-zA-Z0-9]/g, "");
const client = new ConvexHttpClient(convexUrl);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  colorScheme: "light",
  reducedMotion: "reduce",
});
const page = await context.newPage();
let groupId: string | undefined;

async function verifyIcons(native: boolean) {
  for (const label of [
    "WhatsApp",
    "Telegram",
    "Mail",
    ...(native ? ["native"] : []),
  ]) {
    const target =
      label === "native"
        ? page.getByRole("button", { name: "Share", exact: true })
        : page.getByRole("link", { name: `Share via ${label}`, exact: true });
    await expect(target).toBeVisible();
    await expect(target).toHaveText("");
    await expect(target.locator("svg")).toHaveCount(1);
    await expect(target.locator("svg")).toHaveAttribute("aria-hidden", "true");
    expect(
      (await target.locator("svg path").first().getAttribute("d"))!.length,
    ).toBeGreaterThan(10);
    const bounds = await target.boundingBox();
    expect(bounds?.width).toBe(44);
    expect(bounds?.height).toBe(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  console.log(
    `390px icons, names, 44px targets and no overflow verified; native API enabled: ${native}`,
  );
}

try {
  await page.goto(site);
  await page
    .getByRole("button", { name: "Create your link", exact: true })
    .click();
  await expect(
    page.getByText("Your link is ready. Send it to your players."),
  ).toBeVisible();
  const token = await page.evaluate(
    (key) => localStorage.getItem(key),
    `__convexAuthJWT_${suffix}`,
  );
  if (!token) throw new Error("Anonymous GM token was not stored");
  client.setAuth(token);
  const groups = await client.query(api.groups.mine, {});
  expect(groups).toHaveLength(1);
  groupId = groups[0]!.id;
  console.log(
    "Anonymous GM created exactly one test Group; no Account sign-up",
  );
  const view = await client.query(api.groups.get, { groupId });
  const shareUrl = `${site}/s/${view!.shareToken}`;
  await expect(
    page.getByRole("link", { name: "Share via WhatsApp" }),
  ).toHaveAttribute(
    "href",
    `https://wa.me/?text=${encodeURIComponent(`Help me find our next game night. Tap the days you can play, it takes 30 seconds: ${shareUrl}`)}`,
  );
  await expect(
    page.getByRole("link", { name: "Share via Telegram" }),
  ).toHaveAttribute(
    "href",
    `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent("Help me find our next game night. Tap the days you can play, it takes 30 seconds.")}`,
  );
  await expect(
    page.getByRole("link", { name: "Share via Mail" }),
  ).toHaveAttribute("href", /^mailto:/);
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await verifyIcons(false);
    await page.screenshot({
      path: `${out}/prod-link-created-390-${theme}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Share via WhatsApp" })
      .locator("..")
      .screenshot({ path: `${out}/prod-share-row-390-${theme}.png` });
  }
  await page.getByRole("link", { name: "Open your group" }).click();
  await expect(page.getByText("My group").first()).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await verifyIcons(false);
    await page.screenshot({
      path: `${out}/prod-group-390-${theme}.png`,
      fullPage: true,
    });
  }
  expect(await page.evaluate(() => typeof navigator.share)).toBe("undefined");
  console.log(
    "Headless Chromium has no native share API. Additional group screenshots enable a share API stub solely to inspect the fourth production icon.",
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      value: () => Promise.resolve(),
    });
  });
  await page.reload();
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await verifyIcons(true);
    await page
      .getByRole("link", { name: "Share via WhatsApp" })
      .locator("..")
      .screenshot({
        path: `${out}/prod-share-row-native-api-stub-390-${theme}.png`,
      });
  }
} finally {
  if (!groupId) {
    const token = await page
      .evaluate((key) => localStorage.getItem(key), `__convexAuthJWT_${suffix}`)
      .catch(() => null);
    if (token) {
      client.setAuth(token);
      const groups = await client.query(api.groups.mine, {});
      if (groups.length === 1) groupId = groups[0]!.id;
    }
  }
  if (groupId) {
    await client.mutation(api.groups.remove, { groupId });
    expect(await client.query(api.groups.mine, {})).toHaveLength(0);
    console.log(
      "Only the test Group was deleted; verified zero remaining test Groups",
    );
  }
  await browser.close();
}
