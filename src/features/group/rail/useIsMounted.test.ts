import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useIsMounted } from "./useIsMounted";

it("tells a late callback whether its component is still on screen", () => {
  const { result, unmount } = renderHook(() => useIsMounted());
  const isMounted = result.current;
  expect(isMounted()).toBe(true);
  unmount();
  expect(isMounted()).toBe(false);
});
