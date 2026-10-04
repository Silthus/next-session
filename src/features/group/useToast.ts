import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_MS = 5000;

export type GroupToast = { id: number; groupId: string; message: string; undo?: () => void };

export type ShowToast = (message: string, undo?: () => void) => void;

export function useToast(groupId: string) {
  const [toast, setToast] = useState<GroupToast | null>(null);
  const [heldToastId, setHeldToastId] = useState<number | null>(null);
  const lastToastId = useRef(0);
  const currentGroupId = useRef(groupId);

  useEffect(() => {
    currentGroupId.current = groupId;
  }, [groupId]);

  useEffect(() => {
    if (toast === null || toast.id === heldToastId) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, heldToastId]);

  const show: ShowToast = useCallback(
    (message, undo) => {
      if (groupId !== currentGroupId.current) return;
      lastToastId.current += 1;
      setToast({ id: lastToastId.current, groupId, message, undo });
    },
    [groupId],
  );

  return {
    toast: toast?.groupId === groupId ? toast : null,
    show,
    dismiss: () => setToast(null),
    hold: () => setHeldToastId(toast?.id ?? null),
    release: () => setHeldToastId(null),
  };
}
