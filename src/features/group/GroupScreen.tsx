import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { monthOf, type IsoDate, type IsoMonth } from "../../../shared/dates";
import { summarizeMonth } from "../../../shared/monthSummary";
import { isImeComposing } from "../../lib/keyboard";
import { dismissNudge, nudgeDismissedAt, rememberLastGroup } from "../../lib/storage";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { LegalFooter } from "../../ui/LegalFooter";
import { Logo } from "../../ui/Logo";
import { ShareLinkCard } from "../../ui/ShareLinkCard";
import { Skeleton } from "../../ui/Skeleton";
import { Toast, type ToastMessage } from "../../ui/Toast";
import { AccountSheet } from "../account/AccountSheet";
import type { SaveInput } from "../account/save";
import { useGm } from "../account/useGm";
import { visibleDay, visibleMonth } from "./calendar/calendarDates";
import { focusDay, focusMonthHeading } from "./calendar/dayFocus";
import { DayPanel } from "./calendar/DayPanel";
import { HeatCalendar } from "./calendar/HeatCalendar";
import { MobileDaySheet } from "./calendar/MobileDaySheet";
import { useSessionActions } from "./calendar/useSessionActions";
import { useMonthSchedule } from "./calendar/useMonthSchedule";
import { useToday } from "./calendar/useToday";
import { BestNights } from "./rail/BestNights";
import { GroupRail } from "./rail/GroupRail";
import { GroupSwitcherContainer } from "./rail/GroupSwitcherContainer";
import { HeaderAccount } from "./rail/HeaderAccount";
import { Nudge } from "./rail/Nudge";
import { showsNudge } from "./rail/nudge";
import { Players } from "./rail/Players";
import { Sessions } from "./rail/Sessions";
import { useRailActions } from "./rail/useRailActions";
import { useWideLayout } from "./rail/useWideLayout";
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
  const { saveWithGoogle, savedOnReturn, resumingSave } = gm;
  const showToast = toasts.show;

  useEffect(() => {
    if (savedOnReturn) showToast("Saved. Open it anywhere with your account.");
  }, [savedOnReturn, showToast]);
  const finish = () => saveThrough(gm.finishSave);

  const headerActions = (gm.status === "anonymous" || gm.status === "account") && group && (
    <HeaderAccount
      status={gm.status}
      email={gm.email}
      onSave={() => setSaveSheetFor(group.name)}
      onLogOut={() => void gm.signOut()}
    />
  );

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
      <GroupToastRegion toasts={toasts} search={search} />
      <AccountSheet
        open={saveSheetFor !== null}
        intent="save"
        groupName={saveSheetFor ?? ""}
        signedInAs={gm.status === "account" ? gm.email : undefined}
        onSubmit={save}
        onFinish={finish}
        onContinueWithGoogle={saveWithGoogle && (() => saveWithGoogle(groupId))}
        onClose={() => setSaveSheetFor(null)}
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
  const navigate = useNavigate({ from: "/g/$groupId" });
  const showMonth = (next: IsoMonth) => void navigate({ search: { month: next } });
  const selectDay = (day: IsoDate | null) =>
    void navigate({ search: (previous) => ({ ...previous, day: day ?? undefined }) });
  const openDay = (day: IsoDate) => void navigate({ search: { month: monthOf(day), day } });
  const selectedDay = loaded ? visibleDay(search.day, loaded.month) : null;
  const closeDay = () => {
    selectDay(null);
    if (selectedDay) focusDay(selectedDay);
  };

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

  const heading = <GroupSwitcherContainer group={group} />;
  if (loaded === undefined) return <GroupLoading heading={heading} actions={headerActions} />;
  const { month, schedule } = loaded;
  if (schedule === null) {
    return saving ? <GroupLoading heading={heading} /> : <FirstGroupFallback />;
  }

  const summary = summarizeMonth({ month, today, ...schedule });
  const day = summary.days.find((candidate) => candidate.date === selectedDay) ?? null;
  const shareUrl = shareLinkUrl(group.shareToken);
  const dayPanel = (className?: string) =>
    day && (
      <DayPanel
        key={day.date}
        day={day}
        playerCount={schedule.players.length}
        today={today}
        pending={sessions.isPending(day.date)}
        onClose={closeDay}
        onSchedule={() => void sessions.schedule(day.date)}
        onUnschedule={(session) => void sessions.unschedule(session)}
        className={className}
      />
    );
  const nudging = showsNudge({
    anonymous,
    playerCount: schedule.players.length,
    dismissedAt: nudgeSnoozedAt,
    now: openedAt,
  });

  return (
    <GroupFrame heading={heading} actions={headerActions}>
      {nudging && (
        <Nudge
          names={schedule.players.map((player) => player.name)}
          onSave={onSave}
          onLater={laterNudge}
        />
      )}
      {!wide && <ShareLinkCard url={shareUrl} compact onRotate={rotate} />}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <HeatCalendar
          month={requestedMonth}
          today={today}
          players={schedule.players}
          days={summary.days}
          selectedDay={selectedDay}
          onSelectDay={selectDay}
          onMonthChange={showMonth}
        />
        <GroupRail
          wide={wide}
          rosterEmpty={schedule.players.length === 0}
          shareLink={<ShareLinkCard url={shareUrl} onRotate={rotate} />}
          dayPanel={dayPanel()}
          panels={{
            bestNights: (
              <BestNights
                nights={summary.bestNights}
                playerCount={schedule.players.length}
                monthOver={month < monthOf(today)}
                onSelectDay={openDay}
              />
            ),
            sessions: <Sessions sessions={schedule.sessions} today={today} onSelectDay={openDay} />,
            players: (
              <Players
                progress={summary.progress}
                onAdd={rail.addPlayer}
                onRename={rail.renamePlayer}
                onRemove={rail.removePlayer}
              />
            ),
          }}
        />
      </div>
      {day && !wide && (
        <MobileDaySheet date={day.date}>
          {dayPanel("shadow-[0_-8px_32px_-12px_rgb(0_0_0/0.35)]")}
        </MobileDaySheet>
      )}
    </GroupFrame>
  );
}

function GroupToastRegion({ toasts, search }: { toasts: Toasts; search: GroupSearch }) {
  const today = useToday();
  const wide = useWideLayout();
  const dayOpen = visibleDay(search.day, visibleMonth(search.month, today)) !== null;
  const undo = (toast: GroupToast) => {
    toasts.release();
    toasts.dismiss();
    toast.undo?.();
    if (document.activeElement?.closest('[role="status"]')) focusMonthHeading();
  };

  return (
    <div onFocus={toasts.hold} onBlur={toasts.release}>
      <Toast
        position={dayOpen && !wide ? "top" : "bottom"}
        message={toasts.toast && toastMessage(toasts.toast, undo)}
      />
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

function shareLinkUrl(shareToken: string) {
  return `${window.location.origin}/s/${shareToken}`;
}

function GroupFrame({
  heading,
  actions,
  children,
}: {
  heading: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Next Session home" className="shrink-0">
            <Logo />
          </Link>
          {heading && (
            <span className="text-ink-3" aria-hidden="true">
              /
            </span>
          )}
          {heading}
          {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        {children}
      </main>
      <LegalFooter className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6" />
    </div>
  );
}

function GroupLoading({ heading, actions }: { heading?: ReactNode; actions?: ReactNode }) {
  return (
    <GroupFrame heading={heading ?? <Skeleton className="h-7 w-40" />} actions={actions}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]" role="status" aria-busy="true">
        <span className="sr-only">Loading your group</span>
        <Skeleton className="aspect-[7/6] w-full rounded-lg" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    </GroupFrame>
  );
}

export function GroupError({ onRetry }: { onRetry: () => void }) {
  return (
    <GroupFrame heading={null}>
      <Card className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 text-center">
        <h2 className="font-display text-xl font-bold">We lost the connection</h2>
        <p className="text-sm text-ink-2">Your answers are safe. Try again in a moment.</p>
        <Button onClick={onRetry}>Try again</Button>
      </Card>
    </GroupFrame>
  );
}
