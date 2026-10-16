// PROTOTYPE for #128, throwaway. Screenshots every board and the desktop pages, light and dark.
// Run with the dev server up: VITE_CONVEX_URL=https://offline.convex.cloud bunx vite --port 5188
// then: bun scripts/prototype-group-settings-shots.ts
import { chromium } from "@playwright/test";

const origin = process.env.PROTOTYPE_ORIGIN ?? "http://localhost:5188";
const out = new URL("../src/features/group/settings/prototype/screenshots/", import.meta.url).pathname;
const only = process.argv[2];

const boards = ["A", "B", "C", "entry"];
const desktop = [
  { variant: "A", state: "typing" },
  { variant: "B", state: "typing" },
  { variant: "C", state: "filled" },
  { variant: "C", state: "typing" },
];

const browser = await chromium.launch({ env: { ...process.env, LANG: "en_GB.UTF-8", LC_ALL: "en_GB.UTF-8" } });
for (const scheme of ["light", "dark"] as const) {
  const context = await browser.newContext({ colorScheme: scheme, locale: "en-GB", deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const board of boards) {
    if (only && only !== board) continue;
    await page.setViewportSize({ width: 2130, height: 1200 });
    await page.goto(`${origin}/prototype/group-settings?board=${board}`);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${out}board-${board}-${scheme}.png`, fullPage: true });
  }
  for (const { variant, state } of desktop) {
    if (only && only !== `${variant}-${state}`) continue;
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(`${origin}/prototype/group-settings?variant=${variant}&state=${state}&frame=1`);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}desktop-${variant}-${state}-${scheme}.png` });
  }
  await context.close();
}
await browser.close();
