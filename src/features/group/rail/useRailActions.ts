import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { errorMessage } from "../../../lib/errors";

const TOAST_MS = 5000;

export type RailToast = { id: number; message: string; undo?: () => void };

export function useRailActions(groupId: Id<"groups">) {
  const [toast, setToast] = useState<RailToast | null>(null);
  const [heldToastId, setHeldToastId] = useState<number | null>(null);
  const lastToastId = useRef(0);
  const rotateShareToken = useMutation(api.groups.rotateShareToken);
  const undoRotateShareToken = useMutation(api.groups.undoRotateShareToken);
  const addPlayer = useMutation(api.roster.addPlayer);
  const renamePlayer = useMutation(api.roster.renamePlayer);
  const removePlayer = useMutation(api.roster.removePlayer);

  useEffect(() => {
    if (toast === null || toast.id === heldToastId) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, heldToastId]);

  function show(message: string, undo?: () => void) {
    lastToastId.current += 1;
    setToast({ id: lastToastId.current, message, undo });
  }

  async function attempt(action: () => Promise<unknown>, success: () => void) {
    try {
      await action();
      success();
    } catch (error) {
      show(errorMessage(error, "shareLink"));
    }
  }

  function undoRotate() {
    return attempt(
      () => undoRotateShareToken({ groupId }),
      () => show("The old link works again."),
    );
  }

  function rotate() {
    return attempt(
      () => rotateShareToken({ groupId }),
      () => show("Link rotated. Old links stopped working.", () => void undoRotate()),
    );
  }

  return {
    rotate,
    addPlayer: (name: string) => addPlayer({ groupId, name }),
    renamePlayer: (playerId: string, name: string) =>
      renamePlayer({ playerId: playerId as Id<"players">, name }),
    removePlayer: (playerId: string) => removePlayer({ playerId: playerId as Id<"players"> }),
    toast,
    dismissToast: () => setToast(null),
    holdToast: () => setHeldToastId(toast?.id ?? null),
    releaseToast: () => setHeldToastId(null),
  };
}
