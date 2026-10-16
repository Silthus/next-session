import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { cn } from "../../../ui/cn";
import { IconChevron } from "../../../ui/icons";
import { hoverRow } from "../../../ui/interactive";
import { NotFoundScreen } from "../../../ui/NotFoundScreen";
import { Skeleton } from "../../../ui/Skeleton";
import { useGm } from "../../account/useGm";
import { useToday } from "../calendar/useToday";
import { GroupFrame } from "../GroupFrame";
import { handOffToast } from "../useToast";
import { TimeAndPlacePage, type TimeAndPlaceValues } from "./TimeAndPlacePage";

export function TimeAndPlaceScreen({ groupId }: { groupId: string }) {
  const gm = useGm();
  const signedIn = gm.status === "anonymous" || gm.status === "account";
  const group = useQuery(api.groups.get, signedIn ? { groupId } : "skip");
  const settings = useQuery(api.groups.settings, signedIn ? { groupId } : "skip");
  const updateSettings = useMutation(api.groups.updateSettings);
  const navigate = useNavigate();
  const today = useToday();

  if (gm.status === "signedOut") return <Navigate to="/" replace />;
  if (group === null || settings === null) return <NotFoundScreen kind="page" />;
  if (group === undefined || settings === undefined) return <TimeAndPlaceLoading />;

  const save = async (values: TimeAndPlaceValues) => {
    await updateSettings({ groupId: group.id, ...values });
    handOffToast(groupId, "Time and place saved");
    await navigate({ to: "/g/$groupId", params: { groupId } });
  };

  return (
    <GroupFrame heading={<BackToGroup groupId={groupId} name={group.name} />}>
      <div className="mx-auto w-full max-w-4xl sm:py-2">
        <TimeAndPlacePage
          groupName={group.name}
          previewDate={today}
          initial={{
            startTime: settings.startTime,
            lengthMinutes: settings.lengthMinutes,
            timeZone: settings.timeZone,
            location: settings.location ?? "",
          }}
          onSave={save}
        />
      </div>
    </GroupFrame>
  );
}

function BackToGroup({ groupId, name }: { groupId: string; name: string }) {
  return (
    <Link
      to="/g/$groupId"
      params={{ groupId }}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-md px-2 py-1 font-display text-lg font-semibold sm:text-xl",
        hoverRow,
      )}
    >
      <IconChevron direction="left" className="size-4 shrink-0 text-ink-3" />
      <span className="sr-only">Back to </span>
      <span className="truncate">{name}</span>
    </Link>
  );
}

function TimeAndPlaceLoading() {
  return (
    <GroupFrame heading={<Skeleton className="h-7 w-40" />}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4" role="status" aria-busy="true">
        <span className="sr-only">Loading your group</span>
        <Skeleton className="h-16 w-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </GroupFrame>
  );
}
