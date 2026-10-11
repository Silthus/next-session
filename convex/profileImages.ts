import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { downloadGooglePicture, replaceProfileImage } from "./model/profileImages";

export const copy = internalAction({
  args: { userId: v.id("users"), from: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, from }) => {
    const picture = await downloadGooglePicture(from);
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
      if (imageId !== null) await ctx.storage.delete(imageId);
      return null;
    }
    const copied = imageId === null ? {} : { profileImageId: imageId, profileImageFrom: from };
    await replaceProfileImage(ctx, user, copied);
    return null;
  },
});
