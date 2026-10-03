import { beforeEach, describe, expect, it } from "vitest";
import { insertGroup, mintShareToken } from "./groups";
import { newBackend, signInAccount, type TestBackend } from "./test.setup";

let t: TestBackend;

beforeEach(() => {
  t = newBackend();
});

async function seedGroupToken() {
  const { userId } = await signInAccount(t);
  return await t.run(async (ctx) => {
    const groupId = await insertGroup(ctx, (await ctx.db.get("users", userId))!);
    return (await ctx.db.get("groups", groupId))!.shareToken;
  });
}

const bytesSpelling = (token: string) => () =>
  Uint8Array.from(token, (char) =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-".indexOf(char),
  );

describe("mintShareToken", () => {
  it("draws again when a token is taken", async () => {
    const shareToken = await seedGroupToken();
    const draws = [bytesSpelling(shareToken), bytesSpelling("FreshToken")];

    const minted = await t.run(async (ctx) => await mintShareToken(ctx, () => draws.shift()!()));

    expect(minted).toBe("FreshToken");
  });

  it("gives up after 5 taken tokens", async () => {
    const shareToken = await seedGroupToken();
    let draws = 0;
    const alwaysTaken = () => {
      draws++;
      return bytesSpelling(shareToken)();
    };

    await expect(t.run(async (ctx) => await mintShareToken(ctx, alwaysTaken))).rejects.toThrow();
    expect(draws).toBe(5);
  });
});
