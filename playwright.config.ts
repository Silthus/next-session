import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 5173);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun scripts/e2e-server.ts",
    url: baseURL,
    timeout: 180_000,
    stdout: "pipe",
    gracefulShutdown: { signal: "SIGINT", timeout: 10_000 },
  },
});
