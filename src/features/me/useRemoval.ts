import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { IsoDate } from "../../../shared/dates";
import { errorMessage } from "../../lib/errors";
import { track } from "../../lib/telemetry";
import { forgetPendingKeepFor } from "../account/keep";
import type { PlayingGroup } from "./myGroups";

export function useRemoval(
  today: IsoDate,
  show: (message: string, undo?: () => void) => void,
  focusPage: () => void,
) {
  const removeFromMyGroups = useMutation(api.player.removeFromMyGroups).withOptimisticUpdate(
    (store, { groupId }) => {
      const current = store.getQuery(api.me.groups, { today });
      if (!current) return;
      store.setQuery(
        api.me.groups,
        { today },
        { ...current, playing: current.playing.filter((group) => group.groupId !== groupId) },
      );
    },
  );
  const claim = useMutation(api.player.claim);

  async function undo(group: PlayingGroup) {
    track({ name: "remove_group_undone", group_id: group.groupId });
    try {
      await claim({ shareToken: group.shareToken, playerId: group.playerId });
      show(`${group.name} is back in My groups.`);
    } catch (error) {
      show(errorMessage(error, "undoRemove"));
    }
  }

  function remove(group: PlayingGroup) {
    forgetPendingKeepFor(group, sessionStorage);
    track({ name: "remove_group_started", group_id: group.groupId });
    focusPage();
    show(`Removed ${group.name} from My groups.`, () => void undo(group));
    removeFromMyGroups({ groupId: group.groupId }).catch((error: unknown) => {
      show(errorMessage(error, "keep"));
    });
  }

  return { remove };
}
