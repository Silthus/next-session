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

type EnvSource = Record<string, string | undefined>;

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
