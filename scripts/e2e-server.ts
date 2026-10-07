import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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

async function main() {
  const baseURL = process.env.E2E_BASE_URL;
  const convexURL = process.env.E2E_CONVEX_URL;
  const sitePort = process.env.E2E_SITE_PORT;
  if (!baseURL || !convexURL || !sitePort) {
    throw new Error("Run e2e through bun run e2e so it owns its project and ports");
  }
  const backendVersion = localBackendVersionFor(convexCliVersion);
  const env = {
    ...process.env,
    ...LOCAL_BACKEND_ENV,
    CONVEX_AGENT_MODE: "",
    CONVEX_DEPLOYMENT: `anonymous:anonymous-e2e-${randomUUID()}`,
    VITE_CONVEX_URL: convexURL,
  };
  const children = new Map<ChildProcess, Promise<number>>();
  let interrupted = false;
  const stop = () => {
    interrupted = true;
    for (const child of children.keys()) child.kill("SIGINT");
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, stop);
  const start = (command: string, args: string[]) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    const exited = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
    children.set(child, exited);
    return exited;
  };
  try {
    const configured = await start("bunx", [
      "convex",
      "dev",
      "--once",
      "--tail-logs",
      "disable",
      "--local-cloud-port",
      new URL(convexURL).port,
      "--local-site-port",
      sitePort,
      "--local-backend-version",
      backendVersion,
    ]);
    if (interrupted || configured !== 0) {
      process.exitCode = interrupted ? 130 : configured;
      return;
    }
    const state = join(process.cwd(), ".convex", "local", "default");
    const config = JSON.parse(readFileSync(join(state, "config.json"), "utf8")) as {
      deploymentName: string;
      instanceSecret: string;
    };
    const binary = join(
      homedir(),
      ".cache",
      "convex",
      "binaries",
      backendVersion,
      process.platform === "win32" ? "convex-local-backend.exe" : "convex-local-backend",
    );
    const backendExit = start(binary, [
      "--port",
      new URL(convexURL).port,
      "--site-proxy-port",
      sitePort,
      "--instance-name",
      config.deploymentName,
      "--instance-secret",
      config.instanceSecret,
      "--local-storage",
      join(state, "convex_local_storage"),
      join(state, "convex_local_backend.sqlite3"),
    ]);
    await Promise.race([
      waitForBackend(convexURL),
      backendExit.then(() => {
        throw new Error("Local backend exited before becoming ready");
      }),
    ]);
    if (interrupted) return;
    const auth = await start("bun", ["scripts/auth-env.ts", "local"]);
    if (interrupted || auth !== 0) {
      process.exitCode = interrupted ? 130 : auth;
      return;
    }
    const frontendExit = start("bunx", [
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      new URL(baseURL).port,
      "--strictPort",
    ]);
    process.exitCode = await Promise.race([backendExit, frontendExit]);
  } finally {
    stop();
    await Promise.allSettled(children.values());
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.off(signal, stop);
  }
}

async function waitForBackend(url: string) {
  const timeout = AbortSignal.timeout(10_000);
  while (!timeout.aborted) {
    try {
      const response = await fetch(`${url}/instance_name`, { signal: timeout });
      if (response.ok) return;
    } catch {
      if (timeout.aborted) break;
    }
    await delay(50);
  }
  throw new Error("Local backend did not become ready");
}

if (import.meta.main) await main();
