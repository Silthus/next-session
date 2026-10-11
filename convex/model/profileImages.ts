import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const GOOGLE_PICTURE_HOST = "lh3.googleusercontent.com";
const MAX_PICTURE_BYTES = 512 * 1024;

export async function syncProfileImage(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  const from = user?.image ?? undefined;
  if (user === null || from === user.profileImageFrom) return;
  if (from === undefined) {
    await replaceProfileImage(ctx, user, {});
    return;
  }
  await ctx.scheduler.runAfter(0, internal.profileImages.copy, { userId, from });
}

export async function replaceProfileImage(
  ctx: MutationCtx,
  user: Doc<"users">,
  next: { profileImageId?: Id<"_storage">; profileImageFrom?: string },
) {
  if (user.profileImageId !== undefined) await ctx.storage.delete(user.profileImageId);
  await ctx.db.patch("users", user._id, {
    profileImageId: next.profileImageId,
    profileImageFrom: next.profileImageFrom,
  });
}

export async function profileImageUrl(ctx: QueryCtx, user: Doc<"users"> | null) {
  if (user?.profileImageId === undefined) return undefined;
  return (await ctx.storage.getUrl(user.profileImageId)) ?? undefined;
}

export async function downloadGooglePicture(from: string): Promise<Blob | null> {
  if (!isGooglePicture(from)) return null;
  const response = await fetch(from, { redirect: "error" }).catch(() => null);
  if (!response?.ok) return null;
  const picture = await response.blob();
  const isImage = picture.type.startsWith("image/");
  return isImage && picture.size <= MAX_PICTURE_BYTES ? picture : null;
}

function isGooglePicture(from: string) {
  const url = URL.canParse(from) ? new URL(from) : null;
  return url?.protocol === "https:" && url.hostname === GOOGLE_PICTURE_HOST;
}
