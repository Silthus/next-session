import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 5173);
const baseURL = `http://localhost:${port}`;
const localConvexBackend =
  "CONVEX_DEPLOYMENT=anonymous:anonymous-agent CONVEX_AGENT_MODE=anonymous";

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
    command: `${localConvexBackend} bunx convex dev --tail-logs disable --start "bunx vite --port ${port} --strictPort"`,
    url: baseURL,
    timeout: 180_000,
    stdout: "pipe",
    gracefulShutdown: { signal: "SIGINT", timeout: 10_000 },
  },
});
