import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  watch,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createE2eRun } from "./e2e-run";

it("gives concurrent runs fresh projects and ports without changing the developer environment", async () => {
  const source = mkdtempSync(join(tmpdir(), "next-session-source-"));
  writeFileSync(join(source, "package.json"), "{}");
  writeFileSync(join(source, ".env.local"), "developer-only");
  const runs = await Promise.all([createE2eRun(source), createE2eRun(source)]);
  try {
    expect(new Set(runs.flatMap((run) => Object.values(run.ports))).size).toBe(6);
    expect(runs[0].directory).not.toBe(runs[1].directory);
    expect(() => readFileSync(join(runs[0].directory, ".env.local"))).toThrow();
    writeFileSync(join(runs[0].directory, ".env.local"), "run-only");
    await runs[0].dispose();
    expect(readFileSync(join(source, ".env.local"), "utf8")).toBe("developer-only");
    expect(readFileSync(join(runs[1].directory, "package.json"), "utf8")).toBe("{}");
  } finally {
    await Promise.all(runs.map((run) => run.dispose()));
    rmSync(source, { recursive: true, force: true });
  }
});

it.each(["SIGINT", "SIGTERM"] as const)(
  "cleans up its temporary project on %s during initialization",
  async (signal) => {
    const root = mkdtempSync(join(tmpdir(), "e2e-cancellation-"));
    const source = join(root, "source");
    mkdirSync(source);
    writeFileSync(join(source, "package.json"), "{}");
    const watcher = watch(root);
    const child = spawn("bun", [new URL("./e2e-run.ts", import.meta.url).pathname, "--list"], {
      cwd: source,
      env: { ...process.env, TMPDIR: root },
      stdio: "ignore",
    });
    let directory = "";
    watcher.on("change", (_event, name) => {
      if (!directory && typeof name === "string" && name.startsWith("next-session-e2e-")) {
        directory = join(root, name);
        child.kill(signal);
      }
    });
    try {
      await once(child, "exit", { signal: AbortSignal.timeout(10_000) });
      expect(directory).not.toBe("");
      expect(existsSync(directory)).toBe(false);
    } finally {
      watcher.close();
      child.kill("SIGKILL");
      rmSync(root, { recursive: true, force: true });
    }
  },
);
