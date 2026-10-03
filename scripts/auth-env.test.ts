import { describe, expect, it } from "vitest";
import { authEnv, convexEnvSet, parseEnvFile } from "./auth-env";
import { generateAuthKeys } from "./authKeys";

async function signWith(jwtPrivateKey: string, data: Uint8Array<ArrayBuffer>) {
  const der = Buffer.from(jwtPrivateKey.replace(/-----[A-Z ]+-----|\s/g, ""), "base64");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data));
}

async function verifyWith(
  jwks: string,
  signature: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
) {
  const { keys } = JSON.parse(jwks) as { keys: (JsonWebKey & { use: string })[] };
  const key = await crypto.subtle.importKey(
    "jwk",
    keys[0]!,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
}

describe("generateAuthKeys", () => {
  it("makes an RS256 key pair whose JWKS verifies what the private key signs", async () => {
    const { jwtPrivateKey, jwks } = await generateAuthKeys();
    const data = new TextEncoder().encode("next-session");

    const signature = await signWith(jwtPrivateKey, data);

    expect(await verifyWith(jwks, signature, data)).toBe(true);
  });

  it("puts the private key on one line and publishes only the public half", async () => {
    const { jwtPrivateKey, jwks } = await generateAuthKeys();

    expect(jwtPrivateKey).toMatch(
      /^-----BEGIN PRIVATE KEY----- \S+( \S+)* -----END PRIVATE KEY-----$/,
    );
    const [publicKey] = (JSON.parse(jwks) as { keys: Record<string, unknown>[] }).keys;
    expect(publicKey).toMatchObject({ kty: "RSA", use: "sig", alg: "RS256" });
    expect(publicKey).not.toHaveProperty("d");
  });
});

describe("authEnv", () => {
  const keys = { jwtPrivateKey: "private", jwks: '{"keys":[]}' };

  it("points prod at next-session.link", () => {
    expect(authEnv("prod", keys)).toEqual({
      JWT_PRIVATE_KEY: "private",
      JWKS: '{"keys":[]}',
      SITE_URL: "https://next-session.link",
    });
  });

  it("points dev and the local backend at the Vite dev server", () => {
    expect(authEnv("dev", keys).SITE_URL).toBe("http://localhost:5173");
    expect(authEnv("local", keys).SITE_URL).toBe("http://localhost:5173");
  });
});

describe("convexEnvSet", () => {
  const env = {
    JWT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY----- abc -----END PRIVATE KEY-----",
    SITE_URL: "x",
  };

  it("pipes the values through stdin so no secret lands in the process list", () => {
    const { command, stdin } = convexEnvSet("prod", env, { CONVEX_PROD_DEPLOY_KEY: "prod-key" });

    expect(command).toEqual(["bunx", "convex", "env", "set"]);
    expect(command.join(" ")).not.toContain("abc");
    expect(stdin).toBe(
      "JWT_PRIVATE_KEY='-----BEGIN PRIVATE KEY----- abc -----END PRIVATE KEY-----'\nSITE_URL='x'\n",
    );
  });

  it("targets dev and prod through their deploy keys", () => {
    const deployKeys = { CONVEX_DEV_DEPLOY_KEY: "dev-key", CONVEX_PROD_DEPLOY_KEY: "prod-key" };

    expect(convexEnvSet("dev", env, deployKeys).env).toEqual({ CONVEX_DEPLOY_KEY: "dev-key" });
    expect(convexEnvSet("prod", env, deployKeys).env).toEqual({ CONVEX_DEPLOY_KEY: "prod-key" });
  });

  it("refuses to run against dev or prod without that deploy key", () => {
    expect(() => convexEnvSet("prod", env, { CONVEX_DEV_DEPLOY_KEY: "dev-key" })).toThrow(
      "CONVEX_PROD_DEPLOY_KEY",
    );
  });

  it("never overwrites keys on dev or prod, so a rerun cannot sign everyone out", () => {
    expect(convexEnvSet("prod", env, { CONVEX_PROD_DEPLOY_KEY: "k" }).command).not.toContain(
      "--force",
    );
  });

  it("overwrites the throwaway local backend's keys on every start", () => {
    const { command, env: childEnv } = convexEnvSet("local", env, {});

    expect(command).toEqual(["bunx", "convex", "env", "set", "--force"]);
    expect(childEnv).toEqual({});
  });
});

describe("parseEnvFile", () => {
  it("reads KEY=value lines and skips comments and blanks", () => {
    expect(
      parseEnvFile(
        "# keys\nCONVEX_PROD_DEPLOY_KEY=prod:abc|def\n\nCONVEX_DEV_DEPLOY_KEY=dev:x=y\n",
      ),
    ).toEqual({
      CONVEX_PROD_DEPLOY_KEY: "prod:abc|def",
      CONVEX_DEV_DEPLOY_KEY: "dev:x=y",
    });
  });
});
