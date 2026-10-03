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

export type AppEnv = {
  convexUrl: string;
  legal: LegalContact;
};

type EnvSource = Record<string, string | undefined>;

export function readEnv(source: EnvSource): AppEnv {
  return {
    convexUrl: required(source, "VITE_CONVEX_URL"),
    legal: {
      controllerAddress: source.VITE_LEGAL_CONTROLLER_ADDRESS || "address on request",
      contactEmail: source.VITE_LEGAL_CONTACT_EMAIL || "email on request",
    },
  };
}

function required(source: EnvSource, variable: string): string {
  const value = source[variable];
  if (!value) throw new MissingEnvError(variable);
  return value;
}

let cached: AppEnv | undefined;

export function appEnv(): AppEnv {
  cached ??= readEnv(import.meta.env);
  return cached;
}
