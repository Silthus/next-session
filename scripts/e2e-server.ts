import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { version as convexCliVersion } from "convex/package.json";
import { LOCAL_BACKEND_ENV } from "./localBackendEnv";

interface SignalSource {
  on(signal: NodeJS.Signals, listener: () => void): unknown;
}

const localBackendVersionByCli: Record<string, string> = {
  "1.46.0": "precompiled-2026-09-28-5c7cb5b",
};

export function localBackendVersionFor(cliVersion: string) {
  const backendVersion = localBackendVersionByCli[cliVersion];
  if (!backendVersion) {
    throw new Error(
      `No local backend pinned for Convex CLI ${cliVersion}. Pin the version https://version.convex.dev/v1/local_backend_version serves it.`,
    );
  }
  return backendVersion;
}

export function forwardShutdownSignals(child: ChildProcess, source: SignalSource = process) {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    source.on(signal, () => child.kill("SIGINT"));
  }
}

function startLocalBackendWithVite() {
  const localBackendPort = new URL(process.env.E2E_CONVEX_URL!).port;
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
      process.env.E2E_SITE_PORT!,
      "--local-backend-version",
      localBackendVersionFor(convexCliVersion),
      "--start",
      `bun scripts/auth-env.ts local && bunx vite --host 127.0.0.1 --port ${new URL(process.env.E2E_BASE_URL!).port} --strictPort`,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        ...LOCAL_BACKEND_ENV,
        CONVEX_AGENT_MODE: "",
        CONVEX_DEPLOYMENT: `anonymous:anonymous-e2e-${randomUUID()}`,
        VITE_CONVEX_URL: `http://127.0.0.1:${localBackendPort}`,
      },
    },
  );
}

function main() {
  if (!process.env.E2E_BASE_URL || !process.env.E2E_CONVEX_URL || !process.env.E2E_SITE_PORT) {
    throw new Error("Run e2e through bun run e2e so it owns its project and ports");
  }
  const server = startLocalBackendWithVite();
  forwardShutdownSignals(server);
  server.on("exit", (code) => process.exit(code ?? 1));
}

if (import.meta.main) main();
