const SECRET_CODE_BYTES = 32;

export function newSecretCode() {
  return base64url(crypto.getRandomValues(new Uint8Array(SECRET_CODE_BYTES)));
}

export async function hashSecretCode(code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
