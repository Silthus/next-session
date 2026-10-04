import { useEffect, useRef } from "react";

export function useFocusOnMount<Element extends HTMLElement>() {
  const ref = useRef<Element>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}
