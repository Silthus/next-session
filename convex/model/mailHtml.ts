export type MailCopy = { subject: string; text: string; html: string };

const INK = "#1a1511";
const LINK = "#835200";

export function mailPage(blocks: string[]) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px 0;background:#f2e7ce;font-family:'Trebuchet MS',Tahoma,Verdana,sans-serif;color:${INK};">
<div style="max-width:560px;margin:0 auto;background:#fbf5e5;padding:28px 32px;">
<p style="margin:0 0 18px;font-family:'Courier New',monospace;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${LINK};font-weight:bold;">Next Session</p>
${blocks.join("")}</div>
</body></html>
`;
}

export function paragraph(html: string) {
  return `<p style="margin:0 0 14px;font-size:16px;line-height:160%;">${html}</p>\n`;
}

export function button(href: string, label: string) {
  return `<p style="margin:22px 0;"><a href="${escaped(href)}" style="display:inline-block;padding:14px 24px;border-radius:10px;background:#c5953b;color:#221811;font-size:16px;text-decoration:none;">${escaped(label)}</a></p>\n`;
}

export function footnote(html: string) {
  return `<p style="margin:0;font-size:13px;line-height:160%;">${html}</p>\n`;
}

export function link(href: string, label: string) {
  return `<a href="${escaped(href)}" style="color:${LINK};">${escaped(label)}</a>`;
}

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escaped(value: string) {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]!);
}
