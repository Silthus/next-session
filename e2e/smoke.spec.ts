import { expect, test, type Page } from "@playwright/test";

test("the landing page renders the app shell without errors", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/");

  await expect(page).toHaveTitle("Next Session");
  await expect(
    page.getByRole("heading", { level: 1, name: "Stop chasing the date." }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("reduced motion stops pulsing animations after one run", async ({ page }) => {
  await page.goto("/");
  expect(await pulseIterationCount(page)).toBe("infinite");

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await pulseIterationCount(page)).toBe("1");
});

function pulseIterationCount(page: Page) {
  return page.evaluate(() => {
    const pulse = document.createElement("div");
    pulse.className = "animate-pulse";
    document.body.append(pulse);
    const count = getComputedStyle(pulse).animationIterationCount;
    pulse.remove();
    return count;
  });
}
