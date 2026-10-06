import { chromium } from "@playwright/test";
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch();
for (const scheme of ["light", "dark"] as const) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme, deviceScaleFactor: 2 });
  for (const screen of ["page", "link", "broken"]) {
    await page.goto(`${base}/shots.html?screen=${screen}`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${out}/${screen}-${scheme}.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();
