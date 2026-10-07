import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error("Use bun run e2e to allocate an isolated run");

export default defineConfig({
  testDir: "e2e",
  testIgnore: "production.spec.ts",
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: process.env.E2E_REPORT_DIR }]]
    : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  outputDir: process.env.E2E_OUTPUT_DIR,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-webkit", testMatch: "mobile-copy.spec.ts", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "bun scripts/e2e-server.ts",
    url: baseURL,
    timeout: 180_000,
    stdout: "pipe",
    gracefulShutdown: { signal: "SIGINT", timeout: 10_000 },
  },
});
