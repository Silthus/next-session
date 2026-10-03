export const NAME_MAX_LENGTH = 60;

export type NormalizedName = { name: string; nameKey: string };

export function normalizeName(raw: string): NormalizedName | "INVALID_NAME" {
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  const length = [...name].length;
  if (length < 1 || length > NAME_MAX_LENGTH) return "INVALID_NAME";
  return { name, nameKey: name.toLowerCase() };
}

export function playerInitials(name: string): string {
  const [first = "", second] = name.trim().split(/\s+/);
  const letters = second
    ? graphemes(first).slice(0, 1).concat(graphemes(second).slice(0, 1))
    : graphemes(first).slice(0, 2);
  return letters.join("").toUpperCase();
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemes(text: string): string[] {
  return [...graphemeSegmenter.segment(text)].map((segment) => segment.segment);
}
