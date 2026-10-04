import type { Id } from "../../convex/_generated/dataModel";

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type PlayerIdentity = { playerId: Id<"players">; name: string };
type RememberedPlayers = Record<string, PlayerIdentity>;

const PLAYERS_KEY = "next-session.players";
const HINT_KEY_PREFIX = "next-session.playerHint.";
const LAST_GROUP_KEY = "next-session.lastGroup";
const NUDGE_DISMISSED_KEY = "next-session.nudgeDismissedAt";

const noStorage: KeyValueStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function browserStorage(): KeyValueStorage {
  return attempt(() => window.localStorage, noStorage);
}

export function rememberPlayer(
  groupId: string,
  player: PlayerIdentity,
  storage = browserStorage(),
) {
  writePlayers(storage, { ...readPlayers(storage), [groupId]: player });
}

export function recallPlayer(groupId: string, storage = browserStorage()): PlayerIdentity | null {
  const player = readPlayers(storage)[groupId];
  return isPlayerIdentity(player) ? player : null;
}

export function forgetPlayer(groupId: string, storage = browserStorage()) {
  const players = { ...readPlayers(storage) };
  delete players[groupId];
  writePlayers(storage, players);
}

export function hasSeenHint(groupId: string, storage = browserStorage()): boolean {
  return read(storage, HINT_KEY_PREFIX + groupId) !== null;
}

export function markHintSeen(groupId: string, storage = browserStorage()) {
  write(storage, HINT_KEY_PREFIX + groupId, String(Date.now()));
}

export function rememberLastGroup(groupId: string, storage = browserStorage()) {
  write(storage, LAST_GROUP_KEY, groupId);
}

export function lastGroupId(storage = browserStorage()): string | null {
  return read(storage, LAST_GROUP_KEY);
}

export function returningGroupId(
  groups: readonly { id: string }[] | undefined,
  lastId: string | null,
): string | undefined {
  return groups?.find((group) => group.id === lastId)?.id ?? groups?.[0]?.id;
}

export function dismissNudge(now: number, storage = browserStorage()) {
  write(storage, NUDGE_DISMISSED_KEY, String(now));
}

export function nudgeDismissedAt(storage = browserStorage()): number | null {
  const stored = Number(read(storage, NUDGE_DISMISSED_KEY) ?? Number.NaN);
  return Number.isFinite(stored) ? stored : null;
}

function readPlayers(storage: KeyValueStorage): RememberedPlayers {
  const parsed = attempt(() => JSON.parse(read(storage, PLAYERS_KEY) ?? "{}") as unknown, {});
  return isRecord(parsed) ? (parsed as RememberedPlayers) : {};
}

function writePlayers(storage: KeyValueStorage, players: RememberedPlayers) {
  write(storage, PLAYERS_KEY, JSON.stringify(players));
}

function isPlayerIdentity(value: unknown): value is PlayerIdentity {
  return isRecord(value) && typeof value.playerId === "string" && typeof value.name === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function read(storage: KeyValueStorage, key: string): string | null {
  return attempt(() => storage.getItem(key), null);
}

function write(storage: KeyValueStorage, key: string, value: string) {
  attempt(() => storage.setItem(key, value), undefined);
}

function attempt<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}
