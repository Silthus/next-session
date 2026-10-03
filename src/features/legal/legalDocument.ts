export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; text: string };

export type Block =
  | { kind: "paragraph"; lines: Inline[][] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] };

export type LegalSection = { heading: string; blocks: Block[] };

export type LegalDocument = {
  title: string;
  effectiveDate: string | null;
  intro: Block[];
  sections: LegalSection[];
};

export type LegalPlaceholders = {
  EFFECTIVE_DATE: string;
  CONTROLLER_ADDRESS: string;
  CONTACT_EMAIL: string;
};

const versionLine = /^\*\*Version .*Effective: (.+)\*\*$/;

export function parseLegalDocument(
  markdown: string,
  placeholders: LegalPlaceholders,
): LegalDocument {
  const chunks = fillPlaceholders(markdown, placeholders)
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0 && !chunk.startsWith(">"));

  const document: LegalDocument = { title: "", effectiveDate: null, intro: [], sections: [] };

  for (const chunk of chunks) {
    if (chunk.startsWith("# ")) {
      document.title = chunk.slice(2).trim();
    } else if (chunk.startsWith("## ")) {
      document.sections.push({ heading: chunk.slice(3).trim(), blocks: [] });
    } else if (versionLine.test(chunk)) {
      document.effectiveDate = versionLine.exec(chunk)?.[1]?.trim() ?? null;
    } else {
      currentBlocks(document).push(parseBlock(chunk));
    }
  }

  return document;
}

function fillPlaceholders(markdown: string, placeholders: LegalPlaceholders): string {
  return markdown.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    isPlaceholderKey(key, placeholders) ? placeholders[key] : match,
  );
}

function isPlaceholderKey(
  key: string,
  placeholders: LegalPlaceholders,
): key is keyof LegalPlaceholders {
  return key in placeholders;
}

function currentBlocks(document: LegalDocument): Block[] {
  return document.sections.at(-1)?.blocks ?? document.intro;
}

function parseBlock(chunk: string): Block {
  const lines = chunk.split("\n").map((line) => line.trim());
  if (lines.every((line) => line.startsWith("- "))) {
    return { kind: "list", items: lines.map((line) => parseInline(line.slice(2))) };
  }
  if (lines.every((line) => line.startsWith("|"))) {
    return parseTable(lines);
  }
  return { kind: "paragraph", lines: lines.map(parseInline) };
}

function parseTable(lines: string[]): Block {
  const [headerLine, , ...rowLines] = lines;
  return {
    kind: "table",
    header: parseRow(headerLine ?? ""),
    rows: rowLines.map(parseRow),
  };
}

function parseRow(line: string): Inline[][] {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => parseInline(cell.trim()));
}

const inlinePattern = /\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\)|<(https?:\/\/[^>]+)>/g;

export function parseInline(text: string): Inline[] {
  const inlines: Inline[] = [];
  let cursor = 0;
  for (const match of text.matchAll(inlinePattern)) {
    if (match.index > cursor) inlines.push({ kind: "text", text: text.slice(cursor, match.index) });
    inlines.push(toInline(match));
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) inlines.push({ kind: "text", text: text.slice(cursor) });
  return inlines;
}

function toInline([, strong, code, linkText, href, autolink]: RegExpExecArray): Inline {
  if (strong !== undefined) return { kind: "strong", text: strong };
  if (code !== undefined) return { kind: "code", text: code };
  if (autolink !== undefined) return { kind: "link", href: autolink, text: autolink };
  return { kind: "link", href: href ?? "", text: linkText ?? "" };
}
