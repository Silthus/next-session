export const SESSION_STATES = ["scheduled", "cancelled"] as const;
export type SessionState = (typeof SESSION_STATES)[number];
