export class MissingEnvError extends Error {
  constructor(variable: string) {
    super(`${variable} is not set. Add it to .env.local or the build environment.`);
    this.name = "MissingEnvError";
  }
}

export type LegalContact = {
  controllerAddress: string;
  contactEmail: string;
};

export type PostHogEnv = {
  token: string;
  release: string | undefined;
};

export type EnvSource = Record<string, string | undefined>;

export function convexUrl(source: EnvSource = import.meta.env): string {
  const value = source.VITE_CONVEX_URL;
  if (!value) throw new MissingEnvError("VITE_CONVEX_URL");
  return value;
}

export function legalContact(source: EnvSource = import.meta.env): LegalContact {
  return {
    controllerAddress: source.LEGAL_CONTROLLER_ADDRESS || "address on request",
    contactEmail: source.LEGAL_CONTACT_EMAIL || "email on request",
  };
}

export function postHogEnv(source: EnvSource = import.meta.env): PostHogEnv | null {
  const token = source.VITE_POSTHOG_TOKEN;
  return token ? { token, release: source.VITE_RELEASE } : null;
}
