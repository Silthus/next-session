import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/index.css", "utf8");

type Lab = { L: number; a: number; b: number };
type Tokens = Record<string, string>;

const [light, dark] = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map(([, block]) =>
  Object.fromEntries([...(block ?? "").matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, n, v]) => [n, v])),
) as [Tokens, Tokens];

const themes = { light, dark };

const answerTileFloors = {
  light: { text: { free: "#ffffff", busy: "#ffffff", maybe: light.ink }, floor: { free: 3, busy: 3.9, maybe: 8 } },
  dark: { text: { free: dark.paper, busy: dark.paper, maybe: dark.paper }, floor: { free: 10.2, busy: 7, maybe: 10.4 } },
};

const sources = import.meta.glob<string>(["./**/*.tsx", "!./**/*.test.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe.each(["light", "dark"] as const)("the %s theme", (theme) => {
  const token = (name: string) => {
    const value = themes[theme][name];
    if (!value) throw new Error(`--${name} is missing from the ${theme} theme`);
    return value;
  };

  it("uses a gold accent", () => {
    for (const name of ["accent", "accent-strong"]) {
      const { chroma, hue } = polar(token(name));
      expect(hue).toBeGreaterThanOrEqual(70);
      expect(hue).toBeLessThanOrEqual(95);
      expect(chroma).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("keeps the maybe answer clear of the gold accent", () => {
    expect(hueGap(token("maybe"), token("accent"))).toBeGreaterThanOrEqual(25);
  });

  it.each([
    ["ink", "paper", 14],
    ["ink-3", "surface", 4.5],
    ["ink-3", "paper", 4.5],
    ["accent-ink", "accent", 4.5],
    ["accent-strong", "surface", 4.5],
    ["accent-strong", "paper", 4.5],
    ["accent-strong", "accent-soft", 4.5],
  ])("reads %s on %s at %s:1 or better", (text, background, floor) => {
    expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(floor);
  });

  it.each(["free", "maybe", "busy"] as const)(
    "keeps the %s tile at least as readable as before the gold theme",
    (answer) => {
      const { text, floor } = answerTileFloors[theme];
      expect(contrast(text[answer], token(answer))).toBeGreaterThanOrEqual(floor[answer]);
    },
  );
});

describe("the bright accent", () => {
  it.each(Object.entries(sources))("never colours text or focus in %s", (_, source) => {
    expect(source).not.toMatch(/(?<![\w-])text-accent(?![\w-])/);
    expect(source).not.toMatch(/focus[\w-]*:(ring|border)-accent(?![\w-])/);
  });
});

function contrast(first: string, second: string) {
  const [lighter, darker] = [first, second].map((color) => luminance(lab(color))).sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

function polar(color: string) {
  const { a, b } = lab(color);
  return { chroma: Math.hypot(a, b), hue: (((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360 };
}

function hueGap(first: string, second: string) {
  const gap = Math.abs(polar(first).hue - polar(second).hue);
  return Math.min(gap, 360 - gap);
}

function lab(color: string): Lab {
  const oklch = /^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/.exec(color.trim());
  if (oklch) {
    const [lightness, chroma, hue] = oklch.slice(1).map(Number) as [number, number, number];
    const radians = (hue * Math.PI) / 180;
    return { L: lightness / 100, a: chroma * Math.cos(radians), b: chroma * Math.sin(radians) };
  }
  const hex = /^#([\da-f]{6})$/i.exec(color.trim());
  if (!hex) throw new Error(`Unsupported colour ${color}`);
  return labFromLinearSrgb(
    [0, 2, 4].map((offset) => toLinear(parseInt(hex[1]!.slice(offset, offset + 2), 16) / 255)) as [
      number,
      number,
      number,
    ],
  );
}

function toLinear(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function labFromLinearSrgb([r, g, b]: [number, number, number]): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function luminance({ L, a, b }: Lab) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * blue;
}
