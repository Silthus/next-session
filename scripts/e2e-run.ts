import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

async function reservePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP port allocated");
  const lease = join(tmpdir(), `next-session-e2e-port-${address.port}`);
  try {
    mkdirSync(lease);
    return { server, port: address.port, lease };
  } catch (error) {
    await release(server);
    if (error instanceof Error && "code" in error && error.code === "EEXIST") return reservePort();
    throw error;
  }
}

async function release(server: Server) {
  if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
}

export async function createE2eRun(source = process.cwd()) {
  const directory = mkdtempSync(join(tmpdir(), "next-session-e2e-"));
  const reservations: Awaited<ReturnType<typeof reservePort>>[] = [];
  let disposal: Promise<void> | undefined;
  const dispose = () => (disposal ??= removeRun());
  const removeRun = async () => {
    await Promise.all(reservations.map(({ server }) => release(server)));
    for (const { lease } of reservations) rmSync(lease, { recursive: true, force: true });
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    const excluded = new Set([
      ".git",
      ".convex",
      ".tanstack",
      ".wrangler",
      ".vite",
      "node_modules",
      "dist",
      "test-results",
      "playwright-report",
    ]);
    for (const entry of readdirSync(source)) {
      if (excluded.has(entry) || entry.startsWith(".env") || entry.endsWith(".log")) continue;
      cpSync(join(source, entry), join(directory, entry), { recursive: true });
    }
    symlinkSync(resolve(source, "node_modules"), join(directory, "node_modules"), "dir");
    for (let i = 0; i < 3; i++) reservations.push(await reservePort());
    const ports = {
      web: reservations[0]!.port,
      cloud: reservations[1]!.port,
      site: reservations[2]!.port,
    };
    return {
      directory,
      ports,
      releasePorts: () => Promise.all(reservations.map(({ server }) => release(server))),
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}

async function main() {
  let run: Awaited<ReturnType<typeof createE2eRun>> | undefined;
  let child: ChildProcess | undefined;
  let outputDirectory: string | undefined;
  let interrupted = false;
  const stop = () => {
    interrupted = true;
    child?.kill("SIGINT");
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, stop);
  try {
    run = await createE2eRun();
    console.log(`E2E run ${run.directory} ports ${JSON.stringify(run.ports)}`);
    await run.releasePorts();
    if (interrupted) {
      process.exitCode = 130;
      return;
    }
    outputDirectory = resolve("test-results", basename(run.directory));
    child = spawn("bunx", ["playwright", "test", ...process.argv.slice(2)], {
      cwd: run.directory,
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_POSTHOG_TOKEN: "",
        POSTHOG_PERSONAL_API_KEY: "",
        POSTHOG_PROJECT_ID: "",
        E2E_BASE_URL: `http://127.0.0.1:${run.ports.web}`,
        E2E_CONVEX_URL: `http://127.0.0.1:${run.ports.cloud}`,
        E2E_SITE_PORT: String(run.ports.site),
        E2E_OUTPUT_DIR: outputDirectory,
        E2E_REPORT_DIR: resolve("playwright-report", basename(run.directory)),
        ...(process.env.E2E_SCREENSHOTS
          ? { E2E_SCREENSHOTS: resolve(process.env.E2E_SCREENSHOTS, basename(run.directory)) }
          : {}),
      },
    });
    process.exitCode = await new Promise<number>((resolve, reject) => {
      child!.once("error", reject);
      child!.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    await run?.dispose();
    if (
      process.exitCode === 0 &&
      !process.env.CI &&
      !process.env.PLAYER_SCREENSHOTS &&
      outputDirectory
    ) {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.off(signal, stop);
  }
}

if (import.meta.main) await main();
