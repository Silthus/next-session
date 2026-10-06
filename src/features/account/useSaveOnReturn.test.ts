import { act, renderHook, waitFor } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { PENDING_SAVE_KEY, type ClaimDeps } from "./save";
import { useSaveOnReturn } from "./useSaveOnReturn";
import type { GmStatus } from "./useGm";

const groupIds = ["group-1" as Id<"groups">];

class MemoryStorage {
  private readonly items = new Map<string, string>();
  getItem = (key: string) => this.items.get(key) ?? null;
  setItem = (key: string, value: string) => void this.items.set(key, value);
  removeItem = (key: string) => void this.items.delete(key);
}

function deferredFinishSave() {
  const redeemed: string[] = [];
  let settle: (outcome: "moved" | "refused") => void = () => {};
  const finishSave: ClaimDeps["finishSave"] = ({ code }) => {
    redeemed.push(code);
    return new Promise((resolve, reject) => {
      settle = (outcome) =>
        outcome === "moved"
          ? resolve({ groupIds })
          : reject(new ConvexError({ code: "CLAIM_INVALID" }));
    });
  };
  return { finishSave, redeemed, settle: (outcome: "moved" | "refused") => settle(outcome) };
}

function renderOnReturn(
  status: GmStatus,
  { pending = "claim-code" }: { pending?: string | null } = {},
) {
  const storage = new MemoryStorage();
  if (pending !== null) storage.setItem(PENDING_SAVE_KEY, pending);
  const claim = deferredFinishSave();
  const hook = renderHook(
    ({ status }: { status: GmStatus }) =>
      useSaveOnReturn(status, { finishSave: claim.finishSave, storage }),
    { initialProps: { status } },
  );
  return { ...hook, ...claim, storage };
}

describe("useSaveOnReturn", () => {
  it("holds an Account back from Google until its pending Save moved the Groups", async () => {
    const { result, rerender, redeemed, settle } = renderOnReturn("loading");
    expect(result.current).toEqual({ resumingSave: false, savedOnReturn: false });

    rerender({ status: "account" });
    expect(result.current).toEqual({ resumingSave: true, savedOnReturn: false });
    expect(redeemed).toEqual(["claim-code"]);

    act(() => settle("moved"));
    await waitFor(() =>
      expect(result.current).toEqual({ resumingSave: false, savedOnReturn: true }),
    );
  });

  it("lets go without a toast when the claim expired on the way", async () => {
    const { result, settle } = renderOnReturn("account");

    act(() => settle("refused"));

    await waitFor(() =>
      expect(result.current).toEqual({ resumingSave: false, savedOnReturn: false }),
    );
  });

  it("leaves an Anonymous GM's pending Save alone, as Google never signed it in", () => {
    const { result, rerender, redeemed, storage } = renderOnReturn("anonymous");

    rerender({ status: "account" });

    expect(result.current).toEqual({ resumingSave: false, savedOnReturn: false });
    expect(redeemed).toEqual([]);
    expect(storage.getItem(PENDING_SAVE_KEY)).toBe("claim-code");
  });

  it("holds nothing without a pending Save", () => {
    const { result, redeemed } = renderOnReturn("account", { pending: null });

    expect(result.current).toEqual({ resumingSave: false, savedOnReturn: false });
    expect(redeemed).toEqual([]);
  });
});
