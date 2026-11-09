import type { ReactElement } from "react";
import { render } from "react-email";

export type RenderedMail = { subject: string; html: string; text: string };

// One component gives both parts, so the text part never drifts from the HTML.
export async function renderMail(subject: string, mail: ReactElement): Promise<RenderedMail> {
  const [html, text] = await Promise.all([render(mail), render(mail, { plainText: true })]);
  return { subject, html, text };
}
