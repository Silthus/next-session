import { chromium } from "@playwright/test";
const out = process.argv[2];
const browser = await chromium.launch();
for (const scheme of ["light", "dark"] as const) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme, deviceScaleFactor: 2 });
  const ingest: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => r.url().includes("/ingest") && ingest.push(r.url()));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("https://next-session.link/this-page-does-not-exist");
  const h1 = page.getByRole("heading", { level: 1 });
  await h1.waitFor();
  await page.evaluate(() => document.fonts.ready);
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  console.log(scheme, JSON.stringify({ h1: await h1.textContent(), title: await page.title(), focused, ingest: ingest.length, errors, storage: await page.evaluate(() => localStorage.length) }));
  await page.screenshot({ path: `${out}/page-${scheme}.png`, fullPage: true });
  await page.close();
}
await browser.close();
