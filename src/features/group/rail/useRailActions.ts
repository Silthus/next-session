import { useMutation } from "convex/react";
import { useRef } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { errorMessage } from "../../../lib/errors";
import type { ShowToast } from "../useToast";

export function useRailActions(groupId: Id<"groups">, show: ShowToast) {
  const linkChanging = useRef(false);
  const rotateShareToken = useMutation(api.groups.rotateShareToken);
  const undoRotateShareToken = useMutation(api.groups.undoRotateShareToken);
  const addPlayer = useMutation(api.roster.addPlayer);
  const renamePlayer = useMutation(api.roster.renamePlayer);
  const removePlayer = useMutation(api.roster.removePlayer);

  async function changeLink(change: () => Promise<unknown>, done: () => void) {
    if (linkChanging.current) return;
    linkChanging.current = true;
    try {
      await change();
      done();
    } catch (error) {
      show(errorMessage(error, "shareLink"));
    } finally {
      linkChanging.current = false;
    }
  }

  function undoRotate() {
    return changeLink(
      () => undoRotateShareToken({ groupId }),
      () => show("The old link works again."),
    );
  }

  function rotate() {
    return changeLink(
      () => rotateShareToken({ groupId }),
      () => show("Link rotated. Old links stopped working.", () => void undoRotate()),
    );
  }

  return {
    rotate,
    addPlayer: (name: string) => addPlayer({ groupId, name }),
    renamePlayer: (playerId: Id<"players">, name: string) => renamePlayer({ playerId, name }),
    removePlayer: (playerId: Id<"players">) => removePlayer({ playerId }),
  };
}
