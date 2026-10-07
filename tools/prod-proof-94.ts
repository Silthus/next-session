import { chromium } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api";

const out = process.argv[2]!;
const convexUrl = "https://pleasant-sockeye-672.convex.cloud";
const site = "https://next-session.link";
const suffix = convexUrl.replace(/[^a-zA-Z0-9]/g, "");

const gm = new ConvexHttpClient(convexUrl);
const { tokens } = await gm.action(api.auth.signIn, { provider: "anonymous" });
gm.setAuth(tokens!.token);
const [group] = await gm.query(api.groups.mine, {});
console.log("anonymous GM with one Group:", Boolean(group));

const browser = await chromium.launch();
try {
  for (const theme of ["light", "dark"] as const) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    const landing = await context.newPage();
    await landing.goto(site);
    await landing.getByRole("button", { name: "Create your link" }).waitFor();
    await landing.waitForTimeout(800);
    await landing.screenshot({ path: `${out}/prod-landing-390-${theme}.png`, fullPage: true });
    await landing.close();

    const page = await context.newPage();
    await page.goto(`${site}/terms`);
    await page.evaluate(
      ([key, value, refreshKey, refresh]) => {
        localStorage.setItem(key, value);
        localStorage.setItem(refreshKey, refresh);
      },
      [
        `__convexAuthJWT_${suffix}`,
        tokens!.token,
        `__convexAuthRefreshToken_${suffix}`,
        tokens!.refreshToken,
      ] as const,
    );
    await page.goto(`${site}/g/${group!.id}`);
    await page.getByText("My group").first().waitFor();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/prod-group-390-${theme}.png`, fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
  await gm.mutation(api.groups.remove, { groupId: group!.id });
  console.log("test Group removed:", (await gm.query(api.groups.mine, {})).length === 0);
}
