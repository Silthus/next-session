import { useEffect, useRef } from "react";

export function useFocusOnClose<Element extends HTMLElement>(open: boolean) {
  const ref = useRef<Element>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) ref.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return ref;
}
