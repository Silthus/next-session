export const SESSION_STATES = ["scheduled", "cancelled"] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const UNDO_WINDOW_MS = 30_000;
