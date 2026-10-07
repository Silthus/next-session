import { chromium } from "@playwright/test";

const out = process.argv[2] ?? ".";
const stories: [string, string][] = [
  ["landing", "nextsession-loginlanding--default"],
  ["status", "nextsession-entryerrorscreen--default"],
  ["pending", "nextsession-pendingscreen--default"],
  ["link-created", "nextsession-gmtutorialdialog--first-run"],
  ["gm", "schedule-schedulepage--with-selected-group"],
  ["gm-dashboard", "schedule-shared-scheduledashboard--default"],
  ["player", "schedule-playercalendar--default"],
  ["buttons", "primitives-button--all-variants"],
  ["inputs", "primitives-input--all-states"],
  ["dialog", "primitives-dialog--basic-dialog"],
  ["copylink", "schedule-copylinkbutton--default"],
  ["mark", "brand-logo--mark"],
  ["fraunces", "primitives-typography--fraunces"],
];

const browser = await chromium.launch();
for (const width of [390, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
    for (const [name, id] of stories) {
      await page.goto(
        `http://localhost:6006/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`,
      );
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${out}/lonir-${name}-${width}-${theme}.png`, fullPage: true });
    }
    await page.close();
  }
}
await browser.close();
