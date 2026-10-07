import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";
import { faviconPath, rasterIcons, renderFavicon } from "../src/ui/brand/assets";

function write(path: string, content: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`wrote ${path}`);
}

async function rasterize() {
  const browser = await chromium.launch();
  try {
    for (const { path, svg, size } of rasterIcons) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg()}`,
      );
      write(path, await page.screenshot({ omitBackground: true }));
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

write(faviconPath, renderFavicon());
await rasterize();
