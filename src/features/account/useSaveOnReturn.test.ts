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

type Outcome = "moved" | "expired" | "tooManyGroups";

const refusals = {
  expired: new ConvexError({ code: "CLAIM_INVALID" }),
  tooManyGroups: new ConvexError({ code: "TOO_MANY_GROUPS" }),
};

function deferredFinishSave() {
  const redeemed: string[] = [];
  let settle: (outcome: Outcome) => void = () => {};
  const finishSave: ClaimDeps["finishSave"] = ({ code }) => {
    redeemed.push(code);
    return new Promise((resolve, reject) => {
      settle = (outcome) =>
        outcome === "moved" ? resolve({ groupIds }) : reject(refusals[outcome]);
    });
  };
  return { finishSave, redeemed, settle: (outcome: Outcome) => settle(outcome) };
}

const holding = { resumingSave: true, savedOnReturn: false, refusalOnReturn: undefined };
const idle = { resumingSave: false, savedOnReturn: false, refusalOnReturn: undefined };

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
    expect(result.current).toMatchObject(idle);

    rerender({ status: "account" });
    expect(result.current).toMatchObject(holding);
    expect(redeemed).toEqual(["claim-code"]);

    act(() => settle("moved"));
    await waitFor(() => expect(result.current).toMatchObject({ ...idle, savedOnReturn: true }));
  });

  it("reports Saved once, until it is acknowledged", async () => {
    const { result, settle } = renderOnReturn("account");
    act(() => settle("moved"));
    await waitFor(() => expect(result.current.savedOnReturn).toBe(true));

    act(() => result.current.acknowledgeReturn());

    expect(result.current).toMatchObject(idle);
  });

  it.each([
    ["the claim expired on the way", "expired", null],
    ["the move was refused", "tooManyGroups", "claim-code"],
  ] as const)(
    "reports why the Save failed when %s, keeping only a live claim",
    async (_, outcome, kept) => {
      const { result, settle, storage } = renderOnReturn("account");

      act(() => settle(outcome));

      await waitFor(() =>
        expect(result.current).toMatchObject({ ...idle, refusalOnReturn: refusals[outcome] }),
      );
      expect(storage.getItem(PENDING_SAVE_KEY)).toBe(kept);
      act(() => result.current.acknowledgeReturn());
      expect(result.current).toMatchObject(idle);
    },
  );

  it("leaves an Anonymous GM's pending Save alone, as Google never signed it in", () => {
    const { result, rerender, redeemed, storage } = renderOnReturn("anonymous");

    rerender({ status: "account" });

    expect(result.current).toMatchObject(idle);
    expect(redeemed).toEqual([]);
    expect(storage.getItem(PENDING_SAVE_KEY)).toBe("claim-code");
  });

  it("holds nothing without a pending Save", () => {
    const { result, redeemed } = renderOnReturn("account", { pending: null });

    expect(result.current).toMatchObject(idle);
    expect(redeemed).toEqual([]);
  });
});
