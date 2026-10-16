import { Navigate, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { errorMessage } from "../../lib/errors";
import { Toast } from "../../ui/Toast";
import { useGm } from "../account/useGm";
import { useCreateGroup } from "../group/useCreateGroup";
import { useToast, type GroupToast } from "../group/useToast";
import { useTodayUtc } from "../player/useTodayUtc";
import { EmailSettings } from "./EmailSettings";
import { MyGroups } from "./MyGroups";
import { useRemoval } from "./useRemoval";
import type { CalendarFeedActions } from "./YourCalendar";

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
  const calendarFeed = useCalendarFeed(toasts.show);

  if (gm.status === "loading") return <div className="min-h-dvh" />;
  if (!account || groups === null) return <Navigate to="/" replace />;

  return (
    <>
      <MyGroups
        settings={<NotificationSettings />}
        calendarFeed={calendarFeed}
        email={gm.email}
        image={gm.image}
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

function NotificationSettings() {
  const settings = useQuery(api.me.notificationSettings);
  const setSessionEmails = useMutation(api.me.setSessionEmails);
  const setReminders = useMutation(api.me.setReminders);
  return (
    <EmailSettings
      settings={settings ?? undefined}
      saveSessionEmails={(enabled) => setSessionEmails({ enabled })}
      saveReminders={(enabled) => setReminders({ enabled })}
    />
  );
}

function useCreateLink(show: (message: string) => void) {
  const createGroup = useCreateGroup();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const groupId = await createGroup();
      await navigate({ to: "/g/$groupId", params: { groupId } });
    } catch (error) {
      show(errorMessage(error, "group"));
      setCreating(false);
    }
  }

  return { creating, create };
}

function useCalendarFeed(show: (message: string) => void): CalendarFeedActions {
  const calendarFeed = useMutation(api.me.calendarFeed);
  const resetCalendarFeed = useMutation(api.me.resetCalendarFeed);
  return {
    subscribe: async () => (await calendarFeed({})).url,
    reset: async () => {
      const { url } = await resetCalendarFeed({});
      show("New link ready. Calendars on the old link stop updating.");
      return url;
    },
  };
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
