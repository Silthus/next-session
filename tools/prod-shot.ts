import { chromium } from "@playwright/test";
const url = process.argv[2]!;
const browser = await chromium.launch();
for (const colorScheme of ["light", "dark"] as const) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme });
  await page.goto(url);
  await page.getByRole("button", { name: "Create your link" }).waitFor();
  const look = await page.evaluate(() => ({
    page: getComputedStyle(document.body).backgroundColor,
    accent: getComputedStyle(document.documentElement).getPropertyValue("--accent"),
  }));
  console.log(colorScheme, JSON.stringify(look));
  await page.screenshot({ path: `/home/coder/dev/ns-proof-55/prod/prod-landing--390--${colorScheme}.png`, fullPage: true, animations: "disabled" });
  await page.close();
}
await browser.close();
