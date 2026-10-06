import { Navigate, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { IsoDate } from "../../../shared/dates";
import { errorMessage } from "../../lib/errors";
import { Toast } from "../../ui/Toast";
import { useGm } from "../account/useGm";
import { useToast, type GroupToast } from "../group/useToast";
import { useTodayUtc } from "../player/useTodayUtc";
import { MyGroups } from "./MyGroups";
import type { PlayingGroup } from "./myGroups";

const TOAST_SCOPE = "me";

export function MyGroupsScreen() {
  const gm = useGm();
  const today = useTodayUtc();
  const account = gm.status === "account";
  const groups = useQuery(api.me.groups, account ? { today } : "skip");
  const toasts = useToast(TOAST_SCOPE);
  const heading = useRef<HTMLHeadingElement>(null);
  const { remove } = useRemoval(today, toasts.show, () => heading.current?.focus());
  const { creating, create } = useCreateLink(toasts.show);

  if (gm.status === "loading") return <div className="min-h-dvh" />;
  if (!account || groups === null) return <Navigate to="/" replace />;

  return (
    <>
      <MyGroups
        email={gm.email}
        groups={groups}
        today={today}
        creating={creating}
        headingRef={heading}
        onCreate={() => void create()}
        onRemove={remove}
        onLogOut={() => void gm.signOut()}
      />
      <ToastRegion toasts={toasts} onUndone={() => heading.current?.focus()} />
    </>
  );
}

function useRemoval(
  today: IsoDate,
  show: (message: string, undo?: () => void) => void,
  focusPage: () => void,
) {
  const release = useMutation(api.player.release).withOptimisticUpdate((store, { groupId }) => {
    const current = store.getQuery(api.me.groups, { today });
    if (!current) return;
    store.setQuery(
      api.me.groups,
      { today },
      { ...current, playing: current.playing.filter((group) => group.groupId !== groupId) },
    );
  });
  const claim = useMutation(api.player.claim);

  async function undo(group: PlayingGroup) {
    try {
      await claim({ shareToken: group.shareToken, playerId: group.playerId });
      show(`${group.name} is back in My groups.`);
    } catch (error) {
      show(errorMessage(error, "undoRemove"));
    }
  }

  function remove(group: PlayingGroup) {
    focusPage();
    show(`Removed ${group.name} from My groups.`, () => void undo(group));
    release({ groupId: group.groupId }).catch((error: unknown) => {
      show(errorMessage(error, "keep"));
    });
  }

  return { remove };
}

function useCreateLink(show: (message: string) => void) {
  const createGroup = useMutation(api.groups.create);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const groupId = await createGroup({});
      await navigate({ to: "/g/$groupId", params: { groupId } });
    } catch (error) {
      show(errorMessage(error, "group"));
      setCreating(false);
    }
  }

  return { creating, create };
}

function ToastRegion({
  toasts,
  onUndone,
}: {
  toasts: ReturnType<typeof useToast>;
  onUndone: () => void;
}) {
  const undo = (toast: GroupToast) => {
    toasts.release();
    toasts.dismiss();
    toast.undo?.();
    onUndone();
  };
  const { toast } = toasts;
  return (
    <div onFocus={toasts.hold} onBlur={toasts.release}>
      <Toast
        message={
          toast && {
            id: toast.id,
            text: toast.message,
            ...(toast.undo && { action: { label: "Undo", run: () => undo(toast) } }),
          }
        }
      />
    </div>
  );
}
