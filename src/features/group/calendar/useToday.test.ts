import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToday } from "./useToday";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T23:59:58Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useToday", () => {
  it("moves to the next UTC day at midnight in an open tab", () => {
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-10-31");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe("2026-11-01");

    act(() => {
      vi.advanceTimersByTime(86_400_000);
    });
    expect(result.current).toBe("2026-11-02");
  });

  it("catches up when a tab that slept comes back", () => {
    const { result } = renderHook(() => useToday());
    vi.setSystemTime(new Date("2026-11-03T08:00:00Z"));

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe("2026-11-03");
  });
});
