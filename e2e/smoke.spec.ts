import { expect, test } from "@playwright/test";

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
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const iterationCount = await page.evaluate(() => {
    const pulse = document.createElement("div");
    pulse.className = "animate-pulse";
    document.body.append(pulse);
    return getComputedStyle(pulse).animationIterationCount;
  });

  expect(iterationCount).toBe("1");
});
