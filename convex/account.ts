import { v } from "convex/values";
import { query } from "./_generated/server";
import { currentGm } from "./model/access";

export const me = query({
  args: {},
  returns: v.union(v.object({ isAnonymous: v.boolean(), email: v.optional(v.string()) }), v.null()),
  handler: async (ctx) => {
    const gm = await currentGm(ctx);
    if (gm === null) return null;
    return { isAnonymous: gm.isAnonymous === true, email: gm.email };
  },
});
