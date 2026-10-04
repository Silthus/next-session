import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { todayUtc, type IsoDate, type IsoMonth } from "../../../shared/dates";
import { summarizeMonth } from "../../../shared/monthSummary";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { LegalFooter } from "../../ui/LegalFooter";
import { Logo } from "../../ui/Logo";
import { Skeleton } from "../../ui/Skeleton";
import { Toast } from "../../ui/Toast";
import { gmStatus } from "../account/useGm";
import { visibleDay, visibleMonth } from "./calendar/calendarDates";
import { DayPanel } from "./calendar/DayPanel";
import { HeatCalendar } from "./calendar/HeatCalendar";
import { useSessionActions } from "./calendar/useSessionActions";

export type GroupSearch = { month?: string; day?: string };

export function GroupScreen({ groupId, search }: { groupId: string; search: GroupSearch }) {
  const auth = useConvexAuth();
  const status = gmStatus(auth, useQuery(api.account.me));
  const signedIn = status === "anonymous" || status === "account";
  const group = useQuery(api.groups.get, signedIn ? { groupId } : "skip");

  if (status === "signedOut") return <Navigate to="/" replace />;
  if (group === null) return <FirstGroupFallback />;
  if (group === undefined) return <GroupLoading />;
  return <GroupSurface key={group.id} groupId={group.id} name={group.name} search={search} />;
}

function FirstGroupFallback() {
  const groups = useQuery(api.groups.mine);
  if (groups === undefined) return <GroupLoading />;
  const [first] = groups;
  if (first === undefined) return <Navigate to="/" replace />;
  return <Navigate to="/g/$groupId" params={{ groupId: first.id }} replace />;
}

function GroupSurface({
  groupId,
  name,
  search,
}: {
  groupId: Id<"groups">;
  name: string;
  search: GroupSearch;
}) {
  const [today] = useState(() => todayUtc(Date.now()));
  const month = visibleMonth(search.month, today);
  const selectedDay = visibleDay(search.day, month);
  const schedule = useQuery(api.schedule.month, { groupId, month });
  const sessions = useSessionActions(groupId);
  const navigate = useNavigate({ from: "/g/$groupId" });
  const showMonth = (next: IsoMonth) => void navigate({ search: { month: next } });
  const selectDay = (day: IsoDate | null) =>
    void navigate({ search: (previous) => ({ ...previous, day: day ?? undefined }) });

  useEffect(() => {
    if (selectedDay === null) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") selectDay(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  });

  if (schedule === null) return <FirstGroupFallback />;
  if (schedule === undefined) return <GroupLoading name={name} />;

  const summary = summarizeMonth({ month, today, ...schedule });
  const day = summary.days.find((candidate) => candidate.date === selectedDay) ?? null;
  const dayPanel = (className: string) =>
    day && (
      <DayPanel
        key={day.date}
        day={day}
        playerCount={schedule.players.length}
        today={today}
        pending={sessions.isPending(day.date)}
        onClose={() => selectDay(null)}
        onSchedule={() => void sessions.schedule(day.date)}
        onUnschedule={(session) => void sessions.unschedule(session)}
        className={className}
      />
    );

  return (
    <GroupFrame heading={<GroupName name={name} />}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <HeatCalendar
          month={month}
          today={today}
          players={schedule.players}
          days={summary.days}
          selectedDay={selectedDay}
          onSelectDay={selectDay}
          onMonthChange={showMonth}
        />
        <aside aria-label="Group details" className="flex flex-col gap-4">
          {dayPanel("hidden lg:block")}
          {!day && <PickANightHint />}
        </aside>
      </div>
      {day && (
        <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
          <div className="mx-auto max-w-lg px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {dayPanel("shadow-[0_-8px_32px_-12px_rgb(0_0_0/0.35)]")}
          </div>
        </div>
      )}
      {sessions.toast && (
        <Toast
          key={sessions.toast.id}
          action={sessions.toast.undo && "Undo"}
          onAction={() => {
            sessions.toast?.undo?.();
            sessions.dismissToast();
          }}
        >
          {sessions.toast.message}
        </Toast>
      )}
    </GroupFrame>
  );
}

function PickANightHint() {
  return (
    <Card className="border-dashed bg-transparent shadow-none">
      <p className="text-sm font-semibold">Pick a night</p>
      <p className="mt-1 text-sm text-ink-3">
        Tap a day to see who is free, then schedule your next session.
      </p>
    </Card>
  );
}

function GroupFrame({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Next Session home" className="shrink-0">
            <Logo />
          </Link>
          <span className="text-ink-3" aria-hidden="true">
            /
          </span>
          {heading}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        {children}
      </main>
      <LegalFooter className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6" />
    </div>
  );
}

function GroupName({ name }: { name: string }) {
  return <h1 className="min-w-0 truncate font-display text-lg font-bold sm:text-xl">{name}</h1>;
}

function GroupLoading({ name }: { name?: string }) {
  return (
    <GroupFrame
      heading={name === undefined ? <Skeleton className="h-7 w-40" /> : <GroupName name={name} />}
    >
      <div
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]"
        aria-busy="true"
        aria-label="Loading your group"
      >
        <Skeleton className="aspect-[7/6] w-full rounded-lg" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
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
