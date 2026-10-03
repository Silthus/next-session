import { MAX_PLAYERS_PER_GROUP } from "../../shared/limits";
import { normalizeName, type NormalizedName } from "../../shared/names";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { fail } from "./errors";

export function validName(raw: string): NormalizedName {
  const normalized = normalizeName(raw);
  return normalized === "INVALID_NAME" ? fail({ code: "INVALID_NAME" }) : normalized;
}

export async function ensureNameIsFree(
  ctx: QueryCtx,
  groupId: Id<"groups">,
  { nameKey }: NormalizedName,
  renamedPlayerId?: Id<"players">,
) {
  const holder = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId).eq("nameKey", nameKey))
    .first();
  if (holder !== null && holder._id !== renamedPlayerId) {
    fail({ code: "NAME_TAKEN", playerId: holder._id });
  }
}

export async function ensureRosterHasRoom(ctx: QueryCtx, groupId: Id<"groups">) {
  const roster = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId))
    .take(MAX_PLAYERS_PER_GROUP);
  if (roster.length >= MAX_PLAYERS_PER_GROUP) fail({ code: "ROSTER_FULL" });
}
