export type AuthKeys = { jwtPrivateKey: string; jwks: string };

const RS256 = {
  name: "RSASSA-PKCS1-v1_5",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

export async function generateAuthKeys(): Promise<AuthKeys> {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(RS256, true, [
    "sign",
    "verify",
  ]);
  const pkcs8 = base64(await crypto.subtle.exportKey("pkcs8", privateKey));
  const { kty, n, e } = await crypto.subtle.exportKey("jwk", publicKey);
  return {
    jwtPrivateKey: [
      "-----BEGIN PRIVATE KEY-----",
      ...chunk(pkcs8, 64),
      "-----END PRIVATE KEY-----",
    ].join(" "),
    jwks: JSON.stringify({ keys: [{ kty, n, e, use: "sig", alg: "RS256" }] }),
  };
}

function base64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function chunk(text: string, size: number) {
  return Array.from({ length: Math.ceil(text.length / size) }, (_, i) =>
    text.slice(i * size, (i + 1) * size),
  );
}
