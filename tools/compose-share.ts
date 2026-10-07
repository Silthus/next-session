import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const dir = import.meta.dir;
const img = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
const browser = await chromium.launch();
for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
  const bg = theme === "dark" ? "#1a140e" : "#f2e8d0", ink = theme === "dark" ? "#f4ecd8" : "#1c1814";
  const page = await browser.newPage({ viewport: { width: 900, height: 300 } });
  await page.setContent(`<body style="margin:0;padding:16px;background:${bg};color:${ink};font:600 18px system-ui;display:flex;gap:24px;align-items:flex-start;width:max-content">${["before", "after"].map((l) => `<figure style="margin:0"><figcaption style="margin-bottom:8px">${l === "before" ? "Before" : "After"}</figcaption><img src="${img(`${dir}/share/${l}-share-row-${width}-${theme}.png`)}"></figure>`).join("")}</body>`);
  await page.locator("body").screenshot({ path: `${dir}/share/share-row--${width}--${theme}.png` });
  await page.close();
}
await browser.close();
