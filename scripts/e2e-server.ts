import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { LOCAL_BACKEND_ENV } from "./localBackendEnv";

interface SignalSource {
  on(signal: NodeJS.Signals, listener: () => void): unknown;
}

const localBackendPort = 3210;
const localBackendVersion = "precompiled-2026-09-28-5c7cb5b";
const developerEnvFile = ".env.local";

export function forwardShutdownSignals(child: ChildProcess, source: SignalSource = process) {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    source.on(signal, () => child.kill("SIGINT"));
  }
}

function startLocalBackendWithVite() {
  return spawn(
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
      "--local-backend-version",
      localBackendVersion,
      "--start",
      "bun scripts/auth-env.ts local && bunx vite --port 5173 --strictPort",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        ...LOCAL_BACKEND_ENV,
        VITE_CONVEX_URL: `http://127.0.0.1:${localBackendPort}`,
      },
    },
  );
}

function main() {
  const developerEnv = existsSync(developerEnvFile) ? readFileSync(developerEnvFile, "utf8") : null;
  const server = startLocalBackendWithVite();
  forwardShutdownSignals(server);
  server.on("exit", (code) => {
    restoreDeveloperEnv(developerEnv);
    process.exit(code ?? 0);
  });
}

function restoreDeveloperEnv(developerEnv: string | null) {
  if (developerEnv === null) {
    rmSync(developerEnvFile, { force: true });
  } else {
    writeFileSync(developerEnvFile, developerEnv);
  }
}

if (import.meta.main) main();
