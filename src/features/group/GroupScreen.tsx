import { Navigate, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { monthOf, type IsoDate, type IsoMonth } from "../../../shared/dates";
import { summarizeMonth } from "../../../shared/monthSummary";
import { isImeComposing } from "../../lib/keyboard";
import { dismissNudge, nudgeDismissedAt, rememberLastGroup } from "../../lib/storage";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Skeleton } from "../../ui/Skeleton";
import { Toast, type ToastMessage } from "../../ui/Toast";
import { cn } from "../../ui/cn";
import { AccountSheet } from "../account/AccountSheet";
import type { SaveInput } from "../account/save";
import { useGm } from "../account/useGm";
import { monthLabel, visibleDay, visibleMonth } from "./calendar/calendarDates";
import { focusDay, focusMonthHeading } from "./calendar/dayFocus";
import { DayPanel } from "./calendar/DayPanel";
import { HeatCalendar } from "./calendar/HeatCalendar";
import { useDaySlideOver } from "./calendar/useDaySlideOver";
import { useSessionActions } from "./calendar/useSessionActions";
import { useMonthSchedule } from "./calendar/useMonthSchedule";
import { useToday } from "./calendar/useToday";
import { BestNights } from "./rail/BestNights";
import { GroupRail, wideColumns } from "./rail/GroupRail";
import { GroupSwitcherContainer } from "./rail/GroupSwitcherContainer";
import { HeaderAccount } from "./rail/HeaderAccount";
import { HeaderShareLink } from "./rail/HeaderShareLink";
import { Nudge } from "./rail/Nudge";
import { showsNudge } from "./rail/nudge";
import { Players } from "./rail/Players";
import { Sessions } from "./rail/Sessions";
import { useRailActions } from "./rail/useRailActions";
import { shareLinkUrl } from "./shareLink";
import { useWideLayout } from "./rail/useWideLayout";
import { GroupFrame } from "./GroupFrame";
import { useToast, type GroupToast, type ShowToast } from "./useToast";

export type GroupSearch = { month?: string; day?: string };

type GroupView = { id: Id<"groups">; name: string; shareToken: string };

type Toasts = ReturnType<typeof useToast>;

export function GroupScreen({ groupId, search }: { groupId: string; search: GroupSearch }) {
  const gm = useGm();
  const signedIn = gm.status === "anonymous" || gm.status === "account";
  const group = useQuery(api.groups.get, signedIn ? { groupId } : "skip");
  const [saveSheetFor, setSaveSheetFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toasts = useToast(groupId);
  const [focusAfterSave, setFocusAfterSave] = useState(false);
  const headingFocused = useCallback(() => setFocusAfterSave(false), []);

  const saveThrough = async (action: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await action();
      setFocusAfterSave(true);
      toasts.show("Saved. Open it anywhere with your account.");
    } finally {
      setSaving(false);
    }
  };
  const save = (input: SaveInput) => saveThrough(() => gm.save(input));
  const { saveWithGoogle, resumingSave, savedOnReturn, refusalOnReturn, acknowledgeReturn } = gm;
  const [returnRefusal, setReturnRefusal] = useState<unknown>();
  const showToast = toasts.show;

  useEffect(() => {
    if (!savedOnReturn) return;
    showToast("Saved. Open it anywhere with your account.");
    acknowledgeReturn();
  }, [savedOnReturn, showToast, acknowledgeReturn]);

  if (refusalOnReturn !== undefined) {
    acknowledgeReturn();
    setReturnRefusal(refusalOnReturn);
    setSaveSheetFor("your group");
  }

  const closeSaveSheet = () => {
    setSaveSheetFor(null);
    setReturnRefusal(undefined);
  };
  const finish = () => saveThrough(gm.finishSave);

  const headerActions =
    group &&
    (gm.status === "anonymous" ? (
      <HeaderAccount status="anonymous" onSave={() => setSaveSheetFor(group.name)} />
    ) : (
      gm.status === "account" && (
        <HeaderAccount
          status="account"
          email={gm.email}
          image={gm.image}
          onLogOut={() => void gm.signOut()}
        />
      )
    ));

  return (
    <>
      {surfaceFor({
        status: gm.status,
        group,
        saving,
        holdingForSave: saving || resumingSave || saveSheetFor !== null,
        search,
        headerActions,
        showToast: toasts.show,
        focusHeading: focusAfterSave && saveSheetFor === null,
        onHeadingFocused: headingFocused,
        onSave: setSaveSheetFor,
      })}
      <GroupToastRegion toasts={toasts} />
      <AccountSheet
        open={saveSheetFor !== null}
        intent="save"
        groupName={saveSheetFor ?? ""}
        signedInAs={gm.status === "account" ? gm.email : undefined}
        onSubmit={save}
        onFinish={finish}
        refusal={returnRefusal}
        onContinueWithGoogle={saveWithGoogle && (() => saveWithGoogle(groupId))}
        onClose={closeSaveSheet}
      />
    </>
  );
}

function surfaceFor({
  status,
  group,
  saving,
  holdingForSave,
  search,
  headerActions,
  showToast,
  focusHeading,
  onHeadingFocused,
  onSave,
}: {
  status: ReturnType<typeof useGm>["status"];
  group: GroupView | null | undefined;
  saving: boolean;
  holdingForSave: boolean;
  search: GroupSearch;
  headerActions: ReactNode;
  showToast: ShowToast;
  focusHeading: boolean;
  onHeadingFocused: () => void;
  onSave: (groupName: string) => void;
}) {
  if (status === "signedOut" && !holdingForSave) return <Navigate to="/" replace />;
  if (group === null && !holdingForSave) return <FirstGroupFallback />;
  if (!group) return <GroupLoading />;
  return (
    <GroupSurface
      key={group.id}
      group={group}
      anonymous={status === "anonymous"}
      saving={saving}
      search={search}
      headerActions={headerActions}
      showToast={showToast}
      focusHeading={focusHeading}
      onHeadingFocused={onHeadingFocused}
      onSave={() => onSave(group.name)}
    />
  );
}

function FirstGroupFallback() {
  const groups = useQuery(api.groups.mine);
  if (groups === undefined) return <GroupLoading />;
  const [first] = groups;
  if (first === undefined) return <Navigate to="/" replace />;
  return <Navigate to="/g/$groupId" params={{ groupId: first.id }} replace />;
}

function GroupSurface({
  group,
  anonymous,
  saving,
  search,
  headerActions,
  showToast,
  focusHeading,
  onHeadingFocused,
  onSave,
}: {
  group: GroupView;
  anonymous: boolean;
  saving: boolean;
  search: GroupSearch;
  headerActions: ReactNode;
  showToast: ShowToast;
  focusHeading: boolean;
  onHeadingFocused: () => void;
  onSave: () => void;
}) {
  const groupId = group.id;
  const today = useToday();
  const wide = useWideLayout();
  const requestedMonth = visibleMonth(search.month, today);
  const loaded = useMonthSchedule(groupId, requestedMonth);
  const sessions = useSessionActions(groupId, showToast);
  const rail = useRailActions(groupId, showToast);
  const [nudgeSnoozedAt, setNudgeSnoozedAt] = useState(() => nudgeDismissedAt());
  const [openedAt] = useState(() => Date.now());
  const [addPlayerRequests, setAddPlayerRequests] = useState(0);
  const navigate = useNavigate({ from: "/g/$groupId" });
  const showMonth = (next: IsoMonth) => void navigate({ search: { month: next } });
  const selectDay = (day: IsoDate | null) =>
    void navigate({ search: (previous) => ({ ...previous, day: day ?? undefined }) });
  const openDay = (day: IsoDate) => void navigate({ search: { month: monthOf(day), day } });
  const selectedDay = loaded ? visibleDay(search.day, loaded.month) : null;
  const closeDay = () => {
    selectDay(null);
    if (wide && selectedDay) focusDay(selectedDay);
  };
  const slide = useDaySlideOver(visibleDay(search.day, requestedMonth), !wide);

  useEffect(() => rememberLastGroup(groupId), [groupId]);

  const monthShown = loaded?.schedule != null;
  useEffect(() => {
    if (!focusHeading || !monthShown) return;
    const frame = requestAnimationFrame(() => {
      focusMonthHeading();
      onHeadingFocused();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusHeading, monthShown, onHeadingFocused]);

  useEffect(() => {
    if (selectedDay === null) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isImeComposing(event) || insideDialog(event.target)) return;
      closeDay();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  });

  const rotate = () => void rail.rotate();
  const laterNudge = () => {
    const now = Date.now();
    dismissNudge(now);
    setNudgeSnoozedAt(now);
    focusMonthHeading();
  };

  const openTimeAndPlace = () => void navigate({ to: "/g/$groupId/settings", params: { groupId } });
  const heading = (
    <GroupSwitcherContainer
      group={group}
      timeAndPlaceIsNew={loaded?.schedule?.timeAndPlace.saved === false}
      onOpenTimeAndPlace={openTimeAndPlace}
    />
  );
  const shareUrl = shareLinkUrl({
    origin: window.location.origin,
    shareToken: group.shareToken,
    month: requestedMonth,
    today,
  });
  const frame = (body: ReactNode) => (
    <GroupFrame
      heading={heading}
      actions={
        <>
          <HeaderShareLink url={shareUrl} wide={wide} onRotate={rotate} showToast={showToast} />
          {headerActions}
        </>
      }
    >
      {body}
    </GroupFrame>
  );
  if (loaded === undefined) return frame(<GroupLoadingBody />);
  const { month, schedule } = loaded;
  if (schedule === null) return saving ? frame(<GroupLoadingBody />) : <FirstGroupFallback />;
  const { timeAndPlace } = schedule;

  const summary = summarizeMonth({ month, today, ...schedule });
  const day = summary.days.find((candidate) => candidate.date === selectedDay) ?? null;
  const dayPanel = (presentation: DayPanelPresentation) =>
    day && (
      <DayPanel
        key={day.date}
        day={day}
        playerCount={schedule.players.length}
        today={today}
        pending={sessions.isPending(day.date)}
        timeAndPlace={timeAndPlace}
        {...presentation}
        onClose={closeDay}
        onSchedule={() => void sessions.schedule(day.date)}
        onCancel={(session) => void sessions.cancel(session)}
        onOpenTimeAndPlace={openTimeAndPlace}
        onSaveDetails={sessions.updateDetails}
      />
    );
  const nudging = showsNudge({
    anonymous,
    playerCount: schedule.players.length,
    dismissedAt: nudgeSnoozedAt,
    now: openedAt,
  });

  return frame(
    <>
      {nudging && (
        <Nudge
          names={schedule.players.map((player) => player.name)}
          onSave={onSave}
          onLater={laterNudge}
        />
      )}
      <GroupRail
        wide={wide}
        rosterEmpty={schedule.players.length === 0}
        onAddPlayer={() => setAddPlayerRequests((requests) => requests + 1)}
        calendar={
          day && !wide ? (
            dayPanel({
              closeLabel: <BackTo month={month} />,
              className: "animate-slide-forward",
              focusHeading: slide === "forward",
            })
          ) : (
            <div className={cn(slide === "back" && "animate-slide-back")}>
              <HeatCalendar
                month={requestedMonth}
                today={today}
                players={schedule.players}
                days={summary.days}
                selectedDay={selectedDay}
                dayPopover={wide && dayPanel({ className: "shadow-xl" })}
                onSelectDay={selectDay}
                onMonthChange={showMonth}
              />
            </div>
          )
        }
        panels={{
          bestNights: (
            <BestNights
              nights={summary.bestNights}
              playerCount={schedule.players.length}
              monthOver={month < monthOf(today)}
              onSelectDay={openDay}
              onSchedule={wide ? sessions.schedule : undefined}
            />
          ),
          sessions: (
            <Sessions
              sessions={schedule.sessions}
              today={today}
              timeAndPlace={timeAndPlace}
              onSelectDay={openDay}
              onOpenTimeAndPlace={openTimeAndPlace}
            />
          ),
          players: (
            <Players
              progress={summary.progress}
              addRequest={addPlayerRequests}
              onAdd={rail.addPlayer}
              onRename={rail.renamePlayer}
              onRemove={rail.removePlayer}
            />
          ),
        }}
      />
    </>,
  );
}

type DayPanelPresentation = Pick<
  ComponentProps<typeof DayPanel>,
  "closeLabel" | "className" | "focusHeading"
>;

function BackTo({ month }: { month: IsoMonth }) {
  return (
    <span>
      <span className="sr-only">Back to </span>
      {monthLabel(month)}
    </span>
  );
}

function GroupToastRegion({ toasts }: { toasts: Toasts }) {
  const undo = (toast: GroupToast) => {
    toasts.release();
    toasts.dismiss();
    toast.undo?.();
    if (document.activeElement?.closest('[role="status"]')) focusMonthHeading();
  };

  return (
    <div onFocus={toasts.hold} onBlur={toasts.release}>
      <Toast message={toasts.toast && toastMessage(toasts.toast, undo)} />
    </div>
  );
}

function toastMessage(toast: GroupToast, undo: (toast: GroupToast) => void): ToastMessage {
  return {
    id: toast.id,
    text: toast.message,
    ...(toast.undo && { action: { label: "Undo", run: () => undo(toast) } }),
  };
}

function insideDialog(target: EventTarget | null) {
  return target instanceof Element && target.closest("dialog") !== null;
}

function GroupLoading() {
  return (
    <GroupFrame heading={<Skeleton className="h-7 w-40" />}>
      <GroupLoadingBody />
    </GroupFrame>
  );
}

function GroupLoadingBody() {
  const wide = useWideLayout();
  const calendar = <Skeleton className="aspect-[7/6] w-full rounded-xl" />;
  return (
    <div className={wide ? wideColumns : "flex flex-col gap-4"} role="status" aria-busy="true">
      <span className="sr-only">Loading your group</span>
      {wide ? (
        <>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
          {calendar}
          <Skeleton className="h-40 rounded-xl" />
        </>
      ) : (
        <>
          {calendar}
          <Skeleton className="h-40 rounded-xl" />
        </>
      )}
    </div>
  );
}

export function GroupError({ onRetry }: { onRetry: () => void }) {
  return (
    <GroupFrame heading={null}>
      <Card className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 text-center">
        <h2 className="font-display text-xl font-semibold">We lost the connection</h2>
        <p className="text-sm text-ink-2">Your answers are safe. Try again in a moment.</p>
        <Button onClick={onRetry}>Try again</Button>
      </Card>
    </GroupFrame>
  );
}
