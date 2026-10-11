import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { downloadGooglePicture, replaceProfileImage } from "./model/profileImages";

export const copy = internalAction({
  args: { userId: v.id("users"), from: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, from }) => {
    const picture = await downloadGooglePicture(from).catch(() => null);
    const imageId = picture === null ? null : await ctx.storage.store(picture);
    await ctx.runMutation(internal.profileImages.replace, { userId, from, imageId });
    return null;
  },
});

export const replace = internalMutation({
  args: { userId: v.id("users"), from: v.string(), imageId: v.union(v.id("_storage"), v.null()) },
  returns: v.null(),
  handler: async (ctx, { userId, from, imageId }) => {
    const user = await ctx.db.get("users", userId);
    if (user?.image !== from) {
      await discard(ctx, imageId);
      return null;
    }
    if (imageId !== null) {
      await replaceProfileImage(ctx, user, { profileImageId: imageId, profileImageFrom: from });
    } else if (user.profileImageFrom !== from) {
      await replaceProfileImage(ctx, user, {});
    }
    return null;
  },
});

async function discard(ctx: MutationCtx, imageId: Id<"_storage"> | null) {
  if (imageId !== null) await ctx.storage.delete(imageId);
}
