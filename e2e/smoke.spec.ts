import { expect, test } from "@playwright/test";

test("the landing page renders the app shell without errors", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/");

  await expect(page).toHaveTitle("Next Session");
  await expect(page.getByRole("heading", { level: 1, name: "Next Session" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
