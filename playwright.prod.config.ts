import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL;
if (!baseURL) {
  throw new Error("Set BASE_URL to the deployed app, such as https://next-session.link");
}

export default defineConfig({
  testDir: "e2e",
  testMatch: "production.spec.ts",
  outputDir: "test-results/production",
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list", { printSteps: true }],
    ["html", { open: "never", outputFolder: "playwright-report/production" }],
  ],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: { mode: "on", snapshots: false },
    screenshot: "on",
  },
  projects: [{ name: "production", use: { ...devices["Desktop Chrome"] } }],
});
