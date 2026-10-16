import { renderHook } from "@testing-library/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import { useCreateGroup } from "./useCreateGroup";

const sent: { name: string; args: unknown }[] = [];

vi.mock("convex/react", () => ({
  useMutation: (reference: FunctionReference<"mutation">) => (args: unknown) => {
    sent.push({ name: getFunctionName(reference), args });
    return Promise.resolve("group-new");
  },
}));

vi.mock("../../lib/timeZone", () => ({ browserTimeZone: () => "America/New_York" }));

describe("useCreateGroup", () => {
  it("creates the Group in the GM's browser time zone", async () => {
    const { result } = renderHook(() => useCreateGroup());

    await expect(result.current()).resolves.toBe("group-new");
    expect(sent).toEqual([{ name: "groups:create", args: { timeZone: "America/New_York" } }]);
  });
});
