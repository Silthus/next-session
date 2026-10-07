import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";

const [url, out, scheme] = process.argv.slice(2) as [string, string, "light" | "dark"];
const browser = await chromium.launch({
  headless: false,
  args: [
    "--window-position=0,0",
    "--window-size=900,500",
    ...(scheme === "dark" ? ["--force-dark-mode", "--enable-features=WebUIDarkMode"] : []),
  ],
});
const context = await browser.newContext({ viewport: null, colorScheme: scheme });
const first = await context.newPage();
await first.goto(url);
const second = await context.newPage();
await second.goto(url.replace(/\/[^/]*$/, "/terms"));
await first.bringToFront();
await first.waitForTimeout(2500);
execFileSync("python3", [`${import.meta.dir}/xshot.py`, out, "900", "160"]);
await browser.close();
