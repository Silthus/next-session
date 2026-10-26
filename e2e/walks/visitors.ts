import type { Browser } from "@e2e-dev/web";
import type { App } from "e2e";

type Visit = { app: App; browser: Browser };

export async function asAnotherVisitor({ app, browser }: Visit, visit: () => Promise<void>) {
  const returnTo = new URL(await browser.url()).pathname;
  const storage = await browser.evaluate(() => JSON.stringify(localStorage));
  await app.clearState();
  await visit();
  await app.clearState();
  await browser.evaluate((saved: string) => {
    for (const [key, value] of Object.entries(JSON.parse(saved) as Record<string, string>)) {
      localStorage.setItem(key, value);
    }
    return null;
  }, storage);
  await app.open(returnTo);
}
