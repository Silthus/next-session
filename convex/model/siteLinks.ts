declare const process: { env: Record<string, string | undefined> };

export function siteLink(path: string) {
  return new URL(path, process.env.SITE_URL).href;
}
