import { chromium } from "@playwright/test";
import { gunzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { signInAnonymousGm } from "./e2e/helpers";

const out = process.argv[2]!;
const app = "http://127.0.0.1:8787";
const claimCode = "SECRETCODE74x";

type Captured = { at: string; method: string; url: string; body: string };
const captured: Captured[] = [];

function decode(buffer: Buffer | null): string {
  if (!buffer) return "";
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) return gunzipSync(buffer).toString();
  return buffer.toString();
}

const gm = await signInAnonymousGm();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  userAgent:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
});
await context.addInitScript(() => {
  Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
  Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined });
});
const page = await context.newPage();
let phase = "measuring";
await page.route("**/ingest/**", async (route) => {
  const request = route.request();
  captured.push({
    at: phase,
    method: request.method(),
    url: request.url(),
    body: decode(request.postDataBuffer()),
  });
  if (request.url().includes("/ingest/static/")) await route.continue();
  else await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});

await page.goto(`${app}/s/${gm.shareToken}?code=${claimCode}&month=2026-10`);
await page.locator("form input").first().fill("Proof");
await page.getByRole("button", { name: "Join" }).click();
await page.waitForTimeout(1500);
await page.evaluate(() => {
  setTimeout(() => {
    throw new Error(`proof failure on ${location.pathname}${location.search}`);
  });
});
await page.waitForTimeout(4500);
await page.goto(`${app}/privacy`);
await page.getByRole("heading", { name: "Usage measurement" }).scrollIntoViewIfNeeded();
await page.waitForTimeout(4500);
await page.screenshot({ path: `${out}/privacy-switch-on.png`, fullPage: false });

await page.getByRole("button", { name: "Turn off usage measurement in this browser" }).click();
phase = "off";
await page.screenshot({ path: `${out}/privacy-switch-off.png`, fullPage: false });
await page.goto(`${app}/s/${gm.shareToken}?code=${claimCode}`);
await page.waitForTimeout(4500);
const storageAfterOptOut = await page.evaluate(() => ({
  localStorage: Object.keys(localStorage),
  sessionStorage: Object.keys(sessionStorage),
}));
const cookies = await context.cookies();
await browser.close();

const everything = JSON.stringify(captured);
const summary = {
  requests: captured.length,
  byPhase: {
    measuring: captured.filter((c) => c.at === "measuring").map((c) => `${c.method} ${c.url}`),
    off: captured.filter((c) => c.at === "off").map((c) => `${c.method} ${c.url}`),
  },
  allToSameOriginIngest: captured.every((c) => c.url.startsWith(`${app}/ingest/`)),
  events: [...everything.matchAll(/\\"event\\":\\"([^\\]+)\\"/g)].map((m) => m[1]),
  containsShareToken: everything.includes(gm.shareToken),
  containsClaimCode: everything.includes(claimCode),
  containsRedactedPath: everything.includes("/s/:shareToken"),
  containsProductMarker: everything.includes('\\"product\\":\\"next-session\\"'),
  containsDeviceReads: /\$screen_|\$viewport_|\$timezone|\$browser_language/.test(everything),
  storageAfterOptOut,
  cookies: cookies.map((c) => c.name),
};
writeFileSync(`${out}/browser-proof.json`, JSON.stringify({ summary, captured }, null, 2));
console.log(JSON.stringify(summary, null, 2));
