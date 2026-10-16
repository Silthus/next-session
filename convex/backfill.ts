import type { GenericDatabaseWriter, GenericDataModel } from "convex/server";
import { v, type GenericId } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";

export const LEGACY_PAGE_SIZE = 100;
const RETIRED_MAIL_STATES = "sessionMailStates";

export const publishLegacySessions = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("sessions")
      .paginate({ cursor: cursor ?? null, numItems: LEGACY_PAGE_SIZE });
    for (const session of page.filter(isLegacy)) {
      await ctx.db.patch("sessions", session._id, {
        published: { state: "scheduled", revision: 0 },
      });
    }
    if (isDone) await ctx.scheduler.runAfter(0, internal.backfill.emptyRetiredMailStates, {});
    else
      await ctx.scheduler.runAfter(0, internal.backfill.publishLegacySessions, {
        cursor: continueCursor,
      });
    return null;
  },
});

export const emptyRetiredMailStates = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await retiredTables(ctx).query(RETIRED_MAIL_STATES).take(LEGACY_PAGE_SIZE);
    for (const row of rows) {
      await retiredTables(ctx).delete(
        RETIRED_MAIL_STATES,
        row._id as GenericId<"sessionMailStates">,
      );
    }
    if (rows.length === LEGACY_PAGE_SIZE)
      await ctx.scheduler.runAfter(0, internal.backfill.emptyRetiredMailStates, {});
    return null;
  },
});

function isLegacy(session: Doc<"sessions">) {
  return session.published === undefined && session.changedAt === undefined;
}

function retiredTables(ctx: MutationCtx) {
  return ctx.db as unknown as GenericDatabaseWriter<GenericDataModel>;
}
