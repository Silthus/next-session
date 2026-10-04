const LAST_GROUP_KEY = "next-session.lastGroup";
const NUDGE_DISMISSED_KEY = "next-session.nudgeDismissedAt";

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

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: Storage | null, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    return;
  }
}
