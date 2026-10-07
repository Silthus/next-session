import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

const dir = import.meta.dir;
const surfaces: [string, string][] = [
  ["landing", "landing"],
  ["link-created", "link-created"],
  ["gm", "gm-dashboard"],
  ["player", "player"],
  ["save-sheet", "dialog"],
  ["status", "status"],
];

const dataUrl = (path: string) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;

mkdirSync(`${dir}/side-by-side`, { recursive: true });
const browser = await chromium.launch();
for (const [ours, lonir] of surfaces) {
  for (const width of [390, 1440]) {
    for (const theme of ["light", "dark"]) {
      const column = width === 390 ? 390 : 640;
      const columns = [
        ["Lonir", `${dir}/lonir/lonir-${lonir}-${width}-${theme}.png`],
        ["Before", `${dir}/ours/before-${ours}-${width}-${theme}.png`],
        ["After", `${dir}/ours/after-${ours}-${width}-${theme}.png`],
      ];
      const background = theme === "dark" ? "#1a140e" : "#f2e8d0";
      const ink = theme === "dark" ? "#f4ecd8" : "#1c1814";
      const page = await browser.newPage({ viewport: { width: column * 3 + 64, height: 400 } });
      await page.setContent(`<body style="margin:0;padding:16px;background:${background};color:${ink};font:600 18px system-ui;display:flex;gap:16px;align-items:flex-start">
        ${columns
          .map(
            ([label, path]) =>
              `<figure style="margin:0;width:${column}px"><figcaption style="margin-bottom:8px">${label}</figcaption><img style="width:${column}px;display:block;outline:1px solid #8884" src="${dataUrl(path!)}"></figure>`,
          )
          .join("")}</body>`);
      await page.waitForLoadState("load");
      await page.screenshot({
        path: `${dir}/side-by-side/${ours}--${width}--${theme}.png`,
        fullPage: true,
      });
      await page.close();
    }
  }
}
await browser.close();
