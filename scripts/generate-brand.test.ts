import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { faviconPath, rasterIcons, renderFavicon } from "../src/ui/brand/assets";

describe("the committed brand assets", () => {
  it("keep the favicon in step with the L letterform", () => {
    expect(readFileSync(faviconPath, "utf8")).toBe(renderFavicon());
  });

  it.each(rasterIcons.map(({ path }) => path))("include %s", (path) => {
    expect(existsSync(path)).toBe(true);
  });
});
