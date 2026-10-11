import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { downloadGooglePicture, replaceProfileImage } from "./model/profileImages";

export const copy = internalAction({
  args: { userId: v.id("users"), from: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, from }) => {
    const picture = await downloadGooglePicture(from);
    if (picture === null) return null;
    const imageId = await ctx.storage.store(picture);
    await ctx.runMutation(internal.profileImages.keep, { userId, from, imageId });
    return null;
  },
});

export const keep = internalMutation({
  args: { userId: v.id("users"), from: v.string(), imageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { userId, from, imageId }) => {
    const user = await ctx.db.get("users", userId);
    if (user?.image !== from) {
      await ctx.storage.delete(imageId);
      return null;
    }
    await replaceProfileImage(ctx, user, { profileImageId: imageId, profileImageFrom: from });
    return null;
  },
});
