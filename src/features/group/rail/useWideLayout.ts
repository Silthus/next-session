import { useSyncExternalStore } from "react";

const wideQuery = "(min-width: 64rem)";

export function useWideLayout(): boolean {
  return useSyncExternalStore(subscribe, isWide, () => false);
}

function subscribe(onChange: () => void) {
  const query = mediaQuery();
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

function isWide() {
  return mediaQuery()?.matches ?? false;
}

function mediaQuery() {
  return typeof window.matchMedia === "function" ? window.matchMedia(wideQuery) : null;
}
