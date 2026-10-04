import type { Id } from "../../../convex/_generated/dataModel";

export type PlayerIdentity = { playerId: Id<"players">; name: string };

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type RememberedPlayers = Record<string, PlayerIdentity>;

const PLAYERS_KEY = "next-session.players";
const HINT_KEY_PREFIX = "next-session.playerHint.";

const noStorage: KeyValueStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export function browserStorage(): KeyValueStorage {
  return attempt(() => window.localStorage, noStorage);
}

export function rememberPlayer(storage: KeyValueStorage, groupId: string, player: PlayerIdentity) {
  writePlayers(storage, { ...readPlayers(storage), [groupId]: player });
}

export function recallPlayer(storage: KeyValueStorage, groupId: string): PlayerIdentity | null {
  const player = readPlayers(storage)[groupId];
  return isPlayerIdentity(player) ? player : null;
}

export function forgetPlayer(storage: KeyValueStorage, groupId: string) {
  const players = { ...readPlayers(storage) };
  delete players[groupId];
  writePlayers(storage, players);
}

export function hasSeenHint(storage: KeyValueStorage, groupId: string): boolean {
  return attempt(() => storage.getItem(HINT_KEY_PREFIX + groupId), null) !== null;
}

export function markHintSeen(storage: KeyValueStorage, groupId: string) {
  attempt(() => storage.setItem(HINT_KEY_PREFIX + groupId, String(Date.now())), undefined);
}

function readPlayers(storage: KeyValueStorage): RememberedPlayers {
  const parsed = attempt(() => JSON.parse(storage.getItem(PLAYERS_KEY) ?? "{}") as unknown, {});
  return isRecord(parsed) ? (parsed as RememberedPlayers) : {};
}

function writePlayers(storage: KeyValueStorage, players: RememberedPlayers) {
  attempt(() => storage.setItem(PLAYERS_KEY, JSON.stringify(players)), undefined);
}

function isPlayerIdentity(value: unknown): value is PlayerIdentity {
  return isRecord(value) && typeof value.playerId === "string" && typeof value.name === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function attempt<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}
