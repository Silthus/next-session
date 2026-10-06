import { v } from "convex/values";
import { fillRestDates } from "../shared/answers";
import {
  addMonths,
  isBookable,
  isBookableMonth,
  isValidMonth,
  todayUtc,
  type IsoDate,
  type IsoMonth,
} from "../shared/dates";
import { MAX_PLAYERS_PER_GROUP } from "../shared/limits";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  currentAccount,
  findPlayerOnShareLink,
  groupByShareToken,
  playerOnShareLink,
  requireAccount,
  touchGroup,
} from "./model/access";
import { fail } from "./model/errors";
import {
  claimedPlayerIn,
  claimPlayer,
  ensureNameIsFree,
  ensureRosterHasRoom,
  validName,
} from "./model/players";
import { enforceRateLimit } from "./model/rateLimits";
import { answerValue } from "./schema";

const playerGroupView = v.object({
  groupId: v.id("groups"),
  name: v.string(),
  players: v.array(v.object({ _id: v.id("players"), name: v.string() })),
  sessionDates: v.array(v.string()),
  claimedPlayerId: v.union(v.id("players"), v.null()),
});

export const group = query({
  args: { shareToken: v.string() },
  returns: v.union(playerGroupView, v.null()),
  handler: async (ctx, { shareToken }) => {
    const group = await groupByShareToken(ctx, shareToken);
    if (group === null) return null;
    const [players, sessionDates, claimedPlayerId] = await Promise.all([
      rosterOf(ctx, group._id),
      sessionDatesOf(ctx, group._id),
      claimedPlayerIdOfCaller(ctx, group._id),
    ]);
    return { groupId: group._id, name: group.name, players, sessionDates, claimedPlayerId };
  },
});

export const answers = query({
  args: { shareToken: v.string(), playerId: v.string(), month: v.string() },
  returns: v.union(v.record(v.string(), answerValue), v.null()),
  handler: async (ctx, { shareToken, playerId, month }) => {
    const player = await findPlayerOnShareLink(ctx, shareToken, playerId);
    if (player === null || !isValidMonth(month)) return null;
    const rows = await answersOfPlayerIn(ctx, player._id, month);
    return Object.fromEntries(rows.map(({ date, answer }) => [date, answer]));
  },
});

export const join = mutation({
  args: { shareToken: v.string(), name: v.string() },
  returns: v.id("players"),
  handler: async (ctx, { shareToken, name }) => {
    const group = (await groupByShareToken(ctx, shareToken)) ?? fail({ code: "NOT_FOUND" });
    const normalized = validName(name);
    await ensureNameIsFree(ctx, group._id, normalized);
    await ensureRosterHasRoom(ctx, group._id);
    await enforceRateLimit(ctx, "joinGroup", group._id);
    const playerId = await ctx.db.insert("players", { groupId: group._id, ...normalized });
    await claimForAccountCaller(ctx, playerId);
    await touchGroup(ctx, group);
    return playerId;
  },
});

export const claim = mutation({
  args: { shareToken: v.string(), playerId: v.id("players") },
  returns: v.null(),
  handler: async (ctx, { shareToken, playerId }) => {
    const account = await requireAccount(ctx);
    const { player } = await playerOnShareLink(ctx, shareToken, playerId);
    await enforceRateLimit(ctx, "claimPlayer", account._id);
    await claimPlayer(ctx, account, player);
    return null;
  },
});

export const answer = mutation({
  args: {
    shareToken: v.string(),
    playerId: v.id("players"),
    date: v.string(),
    answer: v.union(answerValue, v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { shareToken, playerId, date, answer }) => {
    const { group, player } = await playerOnShareLink(ctx, shareToken, playerId);
    if (!isBookable(date, today())) fail({ code: "OUT_OF_WINDOW" });
    await enforceAnswerRateLimits(ctx, group, player);
    await writeAnswer(ctx, player, date, answer);
    await touchGroup(ctx, group);
    return null;
  },
});

export const fillRest = mutation({
  args: { shareToken: v.string(), playerId: v.id("players"), month: v.string() },
  returns: v.null(),
  handler: async (ctx, { shareToken, playerId, month }) => {
    const { group, player } = await playerOnShareLink(ctx, shareToken, playerId);
    if (!isBookableMonth(month, today())) fail({ code: "OUT_OF_WINDOW" });
    await enforceAnswerRateLimits(ctx, group, player);
    const answered = await answersOfPlayerIn(ctx, player._id, month);
    const unanswered = fillRestDates(month, today(), new Set(answered.map(({ date }) => date)));
    for (const date of unanswered) {
      await ctx.db.insert("answers", {
        groupId: group._id,
        playerId: player._id,
        date,
        answer: "busy",
      });
    }
    await touchGroup(ctx, group);
    return null;
  },
});

async function claimedPlayerIdOfCaller(ctx: QueryCtx, groupId: Id<"groups">) {
  const account = await currentAccount(ctx);
  const claimed = account === null ? null : await claimedPlayerIn(ctx, account._id, groupId);
  return claimed?._id ?? null;
}

async function claimForAccountCaller(ctx: MutationCtx, playerId: Id<"players">) {
  const account = await currentAccount(ctx);
  const player = await ctx.db.get("players", playerId);
  if (account !== null && player !== null) await claimPlayer(ctx, account, player);
}

async function rosterOf(ctx: QueryCtx, groupId: Id<"groups">) {
  const players = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId))
    .take(MAX_PLAYERS_PER_GROUP);
  return players.map(({ _id, name }) => ({ _id, name }));
}

async function sessionDatesOf(ctx: QueryCtx, groupId: Id<"groups">) {
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_groupId_and_date", (q) => q.eq("groupId", groupId))
    .collect();
  return sessions.map(({ date }) => date);
}

async function answersOfPlayerIn(ctx: QueryCtx, playerId: Id<"players">, month: IsoMonth) {
  return await ctx.db
    .query("answers")
    .withIndex("by_playerId_and_date", (q) =>
      q
        .eq("playerId", playerId)
        .gte("date", firstDayOf(month))
        .lt("date", firstDayOf(addMonths(month, 1))),
    )
    .collect();
}

async function answerOn(ctx: QueryCtx, playerId: Id<"players">, date: IsoDate) {
  return await ctx.db
    .query("answers")
    .withIndex("by_playerId_and_date", (q) => q.eq("playerId", playerId).eq("date", date))
    .unique();
}

async function writeAnswer(
  ctx: MutationCtx,
  player: Doc<"players">,
  date: IsoDate,
  answer: Doc<"answers">["answer"] | null,
) {
  const existing = await answerOn(ctx, player._id, date);
  if (answer === null) {
    if (existing !== null) await ctx.db.delete("answers", existing._id);
  } else if (existing === null) {
    await ctx.db.insert("answers", { groupId: player.groupId, playerId: player._id, date, answer });
  } else {
    await ctx.db.patch("answers", existing._id, { answer });
  }
}

async function enforceAnswerRateLimits(
  ctx: MutationCtx,
  group: Doc<"groups">,
  player: Doc<"players">,
) {
  await enforceRateLimit(ctx, "answer", player._id);
  await enforceRateLimit(ctx, "answerPerGroup", group._id);
}

function today() {
  return todayUtc(Date.now());
}

function firstDayOf(month: IsoMonth) {
  return `${month}-01`;
}
