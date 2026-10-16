// PROTOTYPE for #128, throwaway. Where the GM reaches Group settings, and how they learn
// it exists before the first Session goes out: the switcher menu, the Sessions card, the day panel.
import type { ReactNode } from "react";
import { Avatar } from "../../../../ui/Avatar";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { cn } from "../../../../ui/cn";
import { Dot } from "../../../../ui/Dot";
import { IconChevron, IconStar } from "../../../../ui/icons";
import { hoverRow } from "../../../../ui/interactive";
import { Logo } from "../../../../ui/Logo";
import { EmptyLine, RailCard } from "../../rail/RailCard";
import { menuItemClassName } from "../../rail/Popover";
import { emptyNight, filledNight, groupName, timeLine, type UsualNight } from "./fixtures";

export const entryStates = ["menu", "sessions-unset", "sessions-set", "day-unset", "day-set"] as const;
export type EntryState = (typeof entryStates)[number];

export const entryTitles: Record<EntryState, string> = {
  menu: "Group menu",
  "sessions-unset": "Sessions card, no time yet",
  "sessions-set": "Sessions card, time set",
  "day-unset": "Day panel before the first Session",
  "day-set": "Day panel, time set",
};

export function EntryPoint({ state }: { state: EntryState }) {
  return (
    <div className="min-h-dvh">
      <Header menuOpen={state === "menu"} />
      <main className="mx-auto flex max-w-[22rem] flex-col gap-4 px-4 py-4">
        {state === "menu" && <SessionsCard night={emptyNight} />}
        {state === "sessions-unset" && <SessionsCard night={emptyNight} />}
        {state === "sessions-set" && <SessionsCard night={filledNight} upcoming />}
        {state === "day-unset" && <DayCard night={emptyNight} />}
        {state === "day-set" && <DayCard night={filledNight} />}
      </main>
    </div>
  );
}

function Header({ menuOpen }: { menuOpen: boolean }) {
  return (
    <header className="relative border-b border-line bg-paper/85">
      <div className="flex items-center gap-3 px-4 py-3">
        <Logo />
        <span className="text-ink-3" aria-hidden="true">
          /
        </span>
        <div className="relative min-w-0">
          <button
            type="button"
            aria-expanded={menuOpen}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 font-display text-lg font-semibold",
              hoverRow,
            )}
          >
            <span className="truncate">{groupName}</span>
            <IconChevron direction="down" className="shrink-0 text-ink-3" />
          </button>
          {menuOpen && <SwitcherMenu />}
        </div>
      </div>
    </header>
  );
}

function SwitcherMenu() {
  return (
    <div className="animate-rise absolute top-full left-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-1.5 shadow-card">
      <p className="px-2 pt-1 pb-1 font-mono text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">
        Your groups
      </p>
      <a className={cn(menuItemClassName, "bg-surface-2 font-semibold")} aria-current="page">
        <span className="min-w-0 flex-1 truncate">{groupName}</span>
        <span className="font-mono text-[11px] text-ink-3">5</span>
      </a>
      <a className={menuItemClassName}>
        <span className="min-w-0 flex-1 truncate">Sunday board games</span>
        <span className="font-mono text-[11px] text-ink-3">8</span>
      </a>
      <button type="button" className={cn(menuItemClassName, "mt-1 font-semibold text-accent-strong")}>
        <span aria-hidden="true">+</span>New group
      </button>
      <div className="my-1.5 border-t border-line" />
      <button type="button" className={cn(menuItemClassName, "bg-accent-soft font-semibold")}>
        <span className="flex-1">Time and place</span>
        <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-ink">
          New
        </span>
      </button>
      <button type="button" className={menuItemClassName}>
        Rename group
      </button>
      <button type="button" className={cn(menuItemClassName, "text-busy hover:bg-busy-soft")}>
        Delete group
      </button>
    </div>
  );
}

function UsualLine({ night }: { night: UsualNight }) {
  if (!night.start && !night.location) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-line-strong px-3 py-2.5">
        <p className="text-sm font-semibold">When and where do you play?</p>
        <p className="mt-0.5 text-xs text-ink-3">
          Players' calendars get it with every Session. Without a time, a Session shows as all day.
        </p>
        <Button size="sm" variant="soft" className="mt-2">
          Set time and place
        </Button>
      </div>
    );
  }
  return (
    <a
      href="#settings"
      className={cn("-mx-2 mt-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-2", hoverRow)}
    >
      <ClockIcon />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-mono text-[13px] text-ink">{timeLine(night)}</span>
        {night.location && ` · ${night.location}`}
      </span>
      <span className="text-xs font-semibold text-accent-strong">Edit</span>
    </a>
  );
}

function SessionsCard({ night, upcoming = false }: { night: UsualNight; upcoming?: boolean }) {
  return (
    <RailCard title="Sessions" status={upcoming ? "Next in 4 days" : undefined}>
      <UsualLine night={night} />
      {upcoming ? (
        <ul className="mt-2 flex flex-col gap-2">
          <li className="flex items-center gap-3 rounded-md border border-accent/40 bg-accent-soft/50 px-3 py-2.5">
            <IconStar className="size-5 shrink-0 text-accent-strong" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Tuesday, October 20</span>
              <span className="block text-xs text-ink-3">
                in 4 days · <span className="font-mono">{timeLine(night)}</span>
              </span>
            </span>
          </li>
        </ul>
      ) : (
        <EmptyLine>Nothing scheduled. Pick a night from the calendar or the best nights.</EmptyLine>
      )}
    </RailCard>
  );
}

const roster: { name: string; answer: "free" | "maybe" | null }[] = [
  { name: "Ana", answer: "free" },
  { name: "Ben", answer: "free" },
  { name: "Chris", answer: "free" },
  { name: "Dana", answer: "maybe" },
  { name: "Eli", answer: null },
];

function DayCard({ night }: { night: UsualNight }) {
  return (
    <Card accent>
      <div className="flex items-center justify-between">
        <span className="-ml-2 flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-ink-2">
          <IconChevron direction="left" className="size-4" />
          Overview
        </span>
        <span className="text-xs text-ink-3">in 4 days</span>
      </div>
      <h3 className="mt-2 font-display text-2xl font-semibold">Tuesday, October 20</h3>
      <p className="mt-0.5 text-sm text-ink-2">
        <span className="font-semibold text-ink dark:text-free">3 free</span> · 1 maybe · 0 busy · 1 silent
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {roster.map((player) => (
          <li key={player.name} className="flex items-center gap-2.5">
            <Avatar name={player.name} size="sm" />
            <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", !player.answer && "text-ink-3")}>
              {player.name}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
              <Dot answer={player.answer} />
              {player.answer === "free" ? "Free" : player.answer === "maybe" ? "Maybe" : "No answer"}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col gap-2">
        <ScheduleLine night={night} />
        <Button className="w-full">
          <IconStar className="size-4" />
          Schedule this night
        </Button>
      </div>
    </Card>
  );
}

function ScheduleLine({ night }: { night: UsualNight }): ReactNode {
  if (!night.start) {
    return (
      <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-2">
        Players' calendars will show this as all day.{" "}
        <a href="#settings" className="font-semibold text-accent-strong underline-offset-2 hover:underline">
          Add your usual time
        </a>
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-2">
      <ClockIcon />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-mono">{timeLine(night)}</span> · {night.location}
      </span>
      <a href="#settings" className="font-semibold text-accent-strong underline-offset-2 hover:underline">
        Change
      </a>
    </p>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-ink-3" aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v4.2l2.6 1.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
