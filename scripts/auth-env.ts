import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { generateAuthKeys, type AuthKeys } from "./authKeys";
import { LOCAL_BACKEND_ENV } from "./localBackendEnv";

export type Target = "dev" | "prod" | "local";

type Env = Record<string, string>;

const SITE_URLS: Record<Target, string> = {
  dev: "http://localhost:5173",
  prod: "https://next-session.link",
  local: "http://localhost:5173",
};

const DEPLOY_KEY_NAMES: Record<Exclude<Target, "local">, string> = {
  dev: "CONVEX_DEV_DEPLOY_KEY",
  prod: "CONVEX_PROD_DEPLOY_KEY",
};

const DEPLOY_KEYS_FILE = join(homedir(), ".config", "next-session", "deploy-keys.env");

export function authEnv(target: Target, { jwtPrivateKey, jwks }: AuthKeys): Env {
  return { JWT_PRIVATE_KEY: jwtPrivateKey, JWKS: jwks, SITE_URL: SITE_URLS[target] };
}

export function convexEnvSet(target: Target, values: Env, deployKeys: Env) {
  const stdin = Object.entries(values)
    .map(([name, value]) => `${name}='${value}'\n`)
    .join("");
  if (target === "local") {
    return { command: ["bunx", "convex", "env", "set", "--force"], stdin, env: LOCAL_BACKEND_ENV };
  }
  return {
    command: ["bunx", "convex", "env", "set"],
    stdin,
    env: deployKeyEnv(target, deployKeys),
  };
}

function deployKeyEnv(target: Exclude<Target, "local">, deployKeys: Env) {
  const name = DEPLOY_KEY_NAMES[target];
  const deployKey = deployKeys[name];
  if (!deployKey) throw new Error(`${name} is missing from ${DEPLOY_KEYS_FILE}`);
  return { CONVEX_DEPLOY_KEY: deployKey };
}

export function parseEnvFile(text: string): Env {
  const entries = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), unquote(line.slice(separator + 1))] as const;
    });
  return Object.fromEntries(entries);
}

function unquote(value: string) {
  return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
}

function parseTarget(arg: string | undefined): Target {
  if (arg === "dev" || arg === "prod" || arg === "local") return arg;
  throw new Error("Usage: bun scripts/auth-env.ts <dev|prod|local>");
}

async function main() {
  const target = parseTarget(process.argv[2]);
  const deployKeys = target === "local" ? {} : parseEnvFile(readFileSync(DEPLOY_KEYS_FILE, "utf8"));
  const { command, stdin, env } = convexEnvSet(
    target,
    authEnv(target, await generateAuthKeys()),
    deployKeys,
  );
  const [executable, ...args] = command;
  const result = spawnSync(executable!, args, {
    input: stdin,
    stdio: ["pipe", "inherit", "inherit"],
    env: { ...process.env, ...env },
  });
  process.exit(result.status ?? 1);
}

if (import.meta.main) await main();
