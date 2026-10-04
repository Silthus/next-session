import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "./useToast";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("useToast", () => {
  it("shows one toast at a time, the latest, for five seconds", () => {
    const { result } = renderHook(() => useToast("g1"));
    const undo = vi.fn();
    act(() => result.current.show("Link rotated.", undo));
    act(() => result.current.show("Session on Thu, Nov 5."));
    expect(result.current.toast).toMatchObject({ message: "Session on Thu, Nov 5." });
    expect(result.current.toast?.undo).toBeUndefined();

    wait(4999);
    expect(result.current.toast).not.toBeNull();
    wait(1);
    expect(result.current.toast).toBeNull();
  });

  it("keeps a held toast, and lets it go five seconds after release", () => {
    const { result } = renderHook(() => useToast("g1"));
    act(() => result.current.show("Link rotated."));
    act(() => result.current.hold());
    wait(10_000);
    expect(result.current.toast?.message).toBe("Link rotated.");

    act(() => result.current.release());
    wait(5000);
    expect(result.current.toast).toBeNull();
  });

  it("does not carry a hold over to the next toast", () => {
    const { result } = renderHook(() => useToast("g1"));
    act(() => result.current.show("First"));
    act(() => result.current.hold());
    act(() => result.current.show("Second"));
    wait(5000);
    expect(result.current.toast).toBeNull();
  });

  it("keeps a Group's toast to that Group, even when it arrives late", () => {
    const { result, rerender } = renderHook(({ groupId }) => useToast(groupId), {
      initialProps: { groupId: "g1" },
    });
    const showForFirstGroup = result.current.show;
    act(() => showForFirstGroup("Link rotated."));
    rerender({ groupId: "g2" });
    expect(result.current.toast).toBeNull();

    act(() => showForFirstGroup("Session on Thu, Nov 5."));
    expect(result.current.toast).toBeNull();
    act(() => result.current.show("Saved."));
    expect(result.current.toast?.message).toBe("Saved.");
  });

  it("dismisses on demand", () => {
    const { result } = renderHook(() => useToast("g1"));
    act(() => result.current.show("Saved."));
    act(() => result.current.dismiss());
    expect(result.current.toast).toBeNull();
  });
});
