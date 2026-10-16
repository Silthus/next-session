import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { GroupSwitcher } from "./GroupSwitcher";
import { useCreateGroup } from "../useCreateGroup";
import { useIsMounted } from "./useIsMounted";

export function GroupSwitcherContainer({
  group,
  timeAndPlaceIsNew,
  onOpenTimeAndPlace,
}: {
  group: { id: Id<"groups">; name: string };
  timeAndPlaceIsNew: boolean;
  onOpenTimeAndPlace: () => void;
}) {
  const groups = useQuery(api.groups.mine);
  const createGroup = useCreateGroup();
  const renameGroup = useMutation(api.groups.rename);
  const removeGroup = useMutation(api.groups.remove);
  const navigate = useNavigate();
  const isMounted = useIsMounted();
  const open = (groupId: string, replace = false) =>
    void navigate({ to: "/g/$groupId", params: { groupId }, replace });

  const deleteGroup = async () => {
    const next = groups?.find((candidate) => candidate.id !== group.id);
    await removeGroup({ groupId: group.id });
    if (!isMounted()) return;
    if (next) open(next.id, true);
    else void navigate({ to: "/", replace: true });
  };

  return (
    <GroupSwitcher
      group={group}
      groups={groups}
      onOpen={open}
      onCreate={async () => {
        const groupId = await createGroup();
        if (isMounted()) open(groupId);
      }}
      onRename={(name) => renameGroup({ groupId: group.id, name })}
      onDelete={deleteGroup}
      timeAndPlaceIsNew={timeAndPlaceIsNew}
      onOpenTimeAndPlace={onOpenTimeAndPlace}
    />
  );
}
