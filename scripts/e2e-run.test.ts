import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
