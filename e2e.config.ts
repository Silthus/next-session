import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";
import { chatgpt } from "e2e/oauth/chatgpt";

export default {
  tests: "e2e/**/*.e2e.ts",
  agents: { default: { model: chatgpt("gpt-6-luna") } },
  targets: [
    {
      name: "chromium",
      engine: web(),
      app: {
        url: "http://127.0.0.1:0",
        command: {
          executable: "bun",
          args: ["scripts/e2e-run.ts", "--serve", "{port}"],
          startupTimeout: 180_000,
          shutdownTimeout: 15_000,
          log: ".e2e/logs/app.log",
        },
      },
    },
  ],
  timeout: 300_000,
  trace: "on",
} satisfies E2EConfig;
