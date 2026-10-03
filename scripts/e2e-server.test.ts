import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { describe, expect, it } from "vitest";
import { forwardShutdownSignals } from "./e2e-server";

const reportFirstSignal = `
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    process.stdout.write(signal);
    process.exit(0);
  });
}
process.stdout.write("ready ");
setInterval(() => {}, 1000);
`;

async function signalTheChildReceives(sent: NodeJS.Signals) {
  const child = spawn(process.execPath, ["-e", reportFirstSignal]);
  const waitLimit = { signal: AbortSignal.timeout(3_000) };
  try {
    const shell = new EventEmitter();
    forwardShutdownSignals(child, shell);
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (output += chunk));
    const exited = once(child, "exit", waitLimit);
    await once(child.stdout, "data", waitLimit);

    shell.emit(sent);
    await exited;

    return output.replace("ready ", "");
  } finally {
    child.kill("SIGKILL");
  }
}

describe("forwardShutdownSignals", () => {
  it.each(["SIGINT", "SIGTERM"] as const)(
    "stops the Convex CLI with SIGINT on %s, the only signal it cleans up on",
    async (signal) => {
      expect(await signalTheChildReceives(signal)).toBe("SIGINT");
    },
  );
});
