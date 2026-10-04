const SNOOZE_MS = 7 * 86_400_000;
const NAMED_PLAYERS = 2;

export function showsNudge({
  anonymous,
  playerCount,
  dismissedAt,
  now,
}: {
  anonymous: boolean;
  playerCount: number;
  dismissedAt: number | null;
  now: number;
}): boolean {
  if (!anonymous || playerCount === 0) return false;
  return dismissedAt === null || now - dismissedAt >= SNOOZE_MS;
}

export function joinedLine(names: readonly string[]): string {
  const named = names.slice(0, NAMED_PLAYERS);
  const more = names.length - named.length;
  if (more > 0) return `${named.join(", ")} and ${String(more)} more joined.`;
  return `${named.join(" and ")} joined.`;
}
