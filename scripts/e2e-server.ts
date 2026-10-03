import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const port = process.env.E2E_PORT ?? "5173";
const localBackendPort = 3210;
const cloudDeploymentCredentials = {
  CONVEX_DEPLOY_KEY: "",
  CONVEX_DEPLOYMENT_TOKEN: "",
  CONVEX_SELF_HOSTED_URL: "",
  CONVEX_SELF_HOSTED_ADMIN_KEY: "",
};
const developerEnvFile = ".env.local";
const developerEnv = existsSync(developerEnvFile) ? readFileSync(developerEnvFile, "utf8") : null;

const server = spawn(
  "bunx",
  [
    "convex",
    "dev",
    "--tail-logs",
    "disable",
    "--local-cloud-port",
    String(localBackendPort),
    "--local-site-port",
    String(localBackendPort + 1),
    "--start",
    `bunx vite --port ${port} --strictPort`,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ...cloudDeploymentCredentials,
      CONVEX_AGENT_MODE: "anonymous",
      CONVEX_DEPLOYMENT: "anonymous:anonymous-agent",
      VITE_CONVEX_URL: `http://127.0.0.1:${localBackendPort}`,
    },
  },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code) => {
  restoreDeveloperEnv();
  process.exit(code ?? 0);
});

function restoreDeveloperEnv() {
  if (developerEnv === null) {
    rmSync(developerEnvFile, { force: true });
  } else {
    writeFileSync(developerEnvFile, developerEnv);
  }
}
