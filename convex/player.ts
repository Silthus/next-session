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
  releaseClaim,
  ensureAnswersAs,
  ensureRosterHasRoom,
  isLockedFor,
  keepOnAnswer,
  hasRemovedGroup,
  removeFromMyGroups as removeGroupFromMyGroups,
  validName,
} from "./model/players";
import { enforceRateLimit } from "./model/rateLimits";
import { datedSessionOf } from "./sessionLifecycle";
import { calendarInvitesIn } from "./sessionMail";
import { track } from "./model/telemetry";
import { groupTimeOf, sessionTimeAndPlace, sessionTimeAndPlaceFields } from "./model/timeAndPlace";
import { answerValue, datedSession } from "./schema";

const answered = v.object({ keptNow: v.boolean() });

const playerGroupView = v.object({
  groupId: v.id("groups"),
  name: v.string(),
  players: v.array(v.object({ _id: v.id("players"), name: v.string(), locked: v.boolean() })),
  sessions: v.array(v.object({ ...datedSession.fields, ...sessionTimeAndPlaceFields })),
  timeZone: v.string(),
  claimedPlayerId: v.union(v.id("players"), v.null()),
  removedFromMyGroups: v.boolean(),
  opensAsGm: v.boolean(),
  calendarInvites: v.union(v.literal("on"), v.literal("off"), v.null()),
});

export const group = query({
  args: { shareToken: v.string() },
  returns: v.union(playerGroupView, v.null()),
  handler: async (ctx, { shareToken }) => {
    const group = await groupByShareToken(ctx, shareToken);
    if (group === null) return null;
    const [roster, sessions, account] = await Promise.all([
      rosterOf(ctx, group._id),
      sessionsOf(ctx, group),
      currentAccount(ctx),
    ]);
    const caller = await callerIn(ctx, group, account);
    const players = roster.map((player) => ({
      _id: player._id,
      name: player.name,
      locked: isLockedFor(player, account),
    }));
    return {
      groupId: group._id,
      name: group.name,
      players,
      sessions,
      timeZone: groupTimeOf(group).timeZone,
      ...caller,
    };
  },
});

export const answers = query({
  args: { shareToken: v.string(), playerId: v.string(), month: v.string() },
  returns: v.union(v.record(v.string(), answerValue), v.null()),
  handler: async (ctx, { shareToken, playerId, month }) => {
    const player = await answerablePlayerOnShareLink(ctx, shareToken, playerId);
    if (player === null || !isValidMonth(month)) return null;
    const rows = await answersOfPlayerIn(ctx, player._id, month);
    return Object.fromEntries(rows.map(({ date, answer }) => [date, answer]));
  },
});

const othersOnADay = v.object({ free: v.number(), maybe: v.number() });

export const othersAnswers = query({
  args: { shareToken: v.string(), playerId: v.string(), month: v.string() },
  returns: v.union(
    v.object({ others: v.number(), days: v.record(v.string(), othersOnADay) }),
    v.null(),
  ),
  handler: async (ctx, { shareToken, playerId, month }) => {
    const player = await answerablePlayerOnShareLink(ctx, shareToken, playerId);
    if (player === null || !isValidMonth(month)) return null;
    const [roster, rows] = await Promise.all([
      rosterOf(ctx, player.groupId),
      answersOfGroupIn(ctx, player.groupId, month),
    ]);
    const days: Record<IsoDate, { free: number; maybe: number }> = {};
    for (const row of rows) {
      if (row.playerId === player._id || row.answer === "busy") continue;
      const day = (days[row.date] ??= { free: 0, maybe: 0 });
      day[row.answer] += 1;
    }
    return { others: roster.length - 1, days };
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
    const account = await claimForAccountCaller(ctx, playerId);
    await touchGroup(ctx, group);
    await track(ctx, {
      name: "player_joined",
      actor: account ?? { playerId },
      group_id: group._id,
      claimed: account !== null,
    });
    return playerId;
  },
});

export const claim = mutation({
  args: { shareToken: v.string(), playerId: v.id("players") },
  returns: v.null(),
  handler: async (ctx, { shareToken, playerId }) => {
    const account = await requireAccount(ctx);
    const { group, player } = await playerOnShareLink(ctx, shareToken, playerId);
    await enforceRateLimit(ctx, "claimPlayer", account._id);
    if (player.userId === account._id) return null;
    await claimPlayer(ctx, account, player);
    await touchGroup(ctx, group);
    await track(ctx, { name: "player_claimed", actor: account, group_id: group._id });
    return null;
  },
});

export const release = mutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, { groupId }) => {
    const account = await requireAccount(ctx);
    await enforceRateLimit(ctx, "claimPlayer", account._id);
    const released = await releaseClaim(ctx, account, groupId);
    if (released === null) return null;
    await touchGroupOf(ctx, released);
    await track(ctx, { name: "player_released", actor: account, group_id: released.groupId });
    return null;
  },
});

export const removeFromMyGroups = mutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, { groupId }) => {
    const account = await requireAccount(ctx);
    await enforceRateLimit(ctx, "claimPlayer", account._id);
    const released = await removeGroupFromMyGroups(ctx, account, groupId);
    if (released === null) return null;
    await touchGroupOf(ctx, released);
    await track(ctx, { name: "player_released", actor: account, group_id: released.groupId });
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
  returns: answered,
  handler: async (ctx, { shareToken, playerId, date, answer }) => {
    const { group, player } = await playerOnShareLink(ctx, shareToken, playerId);
    ensureAnswersAs(player, await currentAccount(ctx));
    if (!isBookable(date, today())) fail({ code: "OUT_OF_WINDOW" });
    await enforceAnswerRateLimits(ctx, group, player);
    await writeAnswer(ctx, player, date, answer);
    await touchGroup(ctx, group);
    return { keptNow: await keepForAccountCaller(ctx, group, player) };
  },
});

export const fillRest = mutation({
  args: { shareToken: v.string(), playerId: v.id("players"), month: v.string() },
  returns: answered,
  handler: async (ctx, { shareToken, playerId, month }) => {
    const { group, player } = await playerOnShareLink(ctx, shareToken, playerId);
    ensureAnswersAs(player, await currentAccount(ctx));
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
    return { keptNow: await keepForAccountCaller(ctx, group, player) };
  },
});

async function callerIn(ctx: QueryCtx, group: Doc<"groups">, account: Doc<"users"> | null) {
  if (account === null)
    return {
      claimedPlayerId: null,
      removedFromMyGroups: false,
      opensAsGm: false,
      calendarInvites: null,
    };
  const [claimed, removedFromMyGroups, calendarInvites] = await Promise.all([
    claimedPlayerIn(ctx, account._id, group._id),
    hasRemovedGroup(ctx, account._id, group._id),
    calendarInvitesIn(ctx, group, account),
  ]);
  return {
    claimedPlayerId: claimed?._id ?? null,
    removedFromMyGroups,
    opensAsGm: group.ownerId === account._id && claimed === null,
    calendarInvites,
  };
}

async function answerablePlayerOnShareLink(ctx: QueryCtx, shareToken: string, playerId: string) {
  const player = await findPlayerOnShareLink(ctx, shareToken, playerId);
  return player === null || isLockedFor(player, await currentAccount(ctx)) ? null : player;
}

async function claimForAccountCaller(ctx: MutationCtx, playerId: Id<"players">) {
  const account = await currentAccount(ctx);
  if (account === null) return null;
  const player = await ctx.db.get("players", playerId);
  if (player !== null) await claimPlayer(ctx, account, player);
  return account;
}

async function keepForAccountCaller(
  ctx: MutationCtx,
  group: Doc<"groups">,
  player: Doc<"players">,
) {
  const account = await currentAccount(ctx);
  if (account === null || !(await keepOnAnswer(ctx, account, group, player))) return false;
  await track(ctx, { name: "player_claimed", actor: account, group_id: group._id });
  return true;
}

async function touchGroupOf(ctx: MutationCtx, player: Doc<"players">) {
  const group = await ctx.db.get("groups", player.groupId);
  if (group !== null) await touchGroup(ctx, group);
}

async function rosterOf(ctx: QueryCtx, groupId: Id<"groups">) {
  const players = await ctx.db
    .query("players")
    .withIndex("by_groupId_and_nameKey", (q) => q.eq("groupId", groupId))
    .take(MAX_PLAYERS_PER_GROUP);
  return players.map(({ _id, name, userId }) => ({ _id, name, userId }));
}

async function sessionsOf(ctx: QueryCtx, group: Doc<"groups">) {
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_groupId_and_date", (q) => q.eq("groupId", group._id))
    .collect();
  return sessions.map((session) => ({
    ...datedSessionOf(session),
    ...sessionTimeAndPlace(group, session),
  }));
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

async function answersOfGroupIn(ctx: QueryCtx, groupId: Id<"groups">, month: IsoMonth) {
  return await ctx.db
    .query("answers")
    .withIndex("by_groupId_and_date", (q) =>
      q
        .eq("groupId", groupId)
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
