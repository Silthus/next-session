/// <reference types="node" />
// PROTOTYPE, throwaway (#127). Run `bun run prototype` in one shell, then
// `bun src/features/player/prototype/screenshots.ts [baseUrl]` to refresh the screenshots.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const out = "src/features/player/prototype/screenshots";
const allStates = [
  "visitor-answering",
  "visitor-done",
  "visitor-done-later",
  "visitor-nothing-scheduled",
  "account-answering",
  "account-done",
  "account-not-kept",
];
const visitorStates = allStates.filter((state) => state.startsWith("visitor"));
const viewports = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 900 },
};

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();

async function shoot(
  state: string,
  variant: string,
  device: keyof typeof viewports,
  theme: "light" | "dark",
) {
  const page = await browser.newPage({ viewport: viewports[device], colorScheme: theme });
  await page.goto(`${base}/prototype/calendar-prompt?state=${state}&variant=${variant}&embed=1`);
  await page.getByRole("heading", { name: "Thursday Crew" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${out}/${variant}-${state}-${device}-${theme}.png`,
    fullPage: true,
  });
  await page.close();
}

for (const state of allStates)
  for (const device of ["mobile", "desktop"] as const)
    for (const theme of ["light", "dark"] as const) await shoot(state, "A", device, theme);

for (const variant of ["B", "C"])
  for (const state of visitorStates)
    for (const theme of ["light", "dark"] as const) await shoot(state, variant, "mobile", theme);

await browser.close();
