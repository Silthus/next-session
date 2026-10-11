import { useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import type { IsoDate } from "../../../../shared/dates";
import { Avatar } from "../../../ui/Avatar";
import { Button } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { IconStar } from "../../../ui/icons";
import { pressable } from "../../../ui/interactive";
import { nightLabel } from "../calendar/calendarDates";
import type { CalendarDay } from "../calendar/DayCell";
import { EmptyLine, RailCard } from "./RailCard";

const SHOWN_AVATARS = 4;

export function BestNights({
  nights,
  playerCount,
  monthOver,
  onSelectDay,
  onSchedule,
}: {
  nights: readonly CalendarDay[];
  playerCount: number;
  monthOver: boolean;
  onSelectDay: (date: IsoDate) => void;
  onSchedule?: (date: IsoDate) => Promise<unknown>;
}) {
  return (
    <RailCard title="Best nights">
      {nights.length === 0 ? (
        <EmptyLine>{emptyLine(playerCount, monthOver)}</EmptyLine>
      ) : (
        <ol className="mt-3 flex flex-col gap-1">
          {nights.map((night, index) => (
            <BestNight
              key={night.date}
              night={night}
              rank={index + 1}
              playerCount={playerCount}
              onSelectDay={onSelectDay}
              onSchedule={onSchedule}
            />
          ))}
        </ol>
      )}
    </RailCard>
  );
}

function emptyLine(playerCount: number, monthOver: boolean) {
  if (monthOver) return "This month is over. Pick a later one.";
  if (playerCount === 0) return "Once players answer, the best nights show up here.";
  return "No night works for everyone yet. Nudge the quiet ones.";
}

function BestNight({
  night,
  rank,
  playerCount,
  onSelectDay,
  onSchedule,
}: {
  night: CalendarDay;
  rank: number;
  playerCount: number;
  onSelectDay: (date: IsoDate) => void;
  onSchedule?: (date: IsoDate) => Promise<unknown>;
}) {
  const row = useRef<HTMLButtonElement>(null);
  return (
    <li className="group relative">
      <NightRow
        ref={row}
        night={night}
        rank={rank}
        playerCount={playerCount}
        onSelect={() => onSelectDay(night.date)}
      />
      {onSchedule && night.session === null && (
        <QuickSchedule night={night} focusAfter={row} onSchedule={onSchedule} />
      )}
    </li>
  );
}

function NightRow({
  ref,
  night,
  rank,
  playerCount,
  onSelect,
}: {
  ref: Ref<HTMLButtonElement>;
  night: CalendarDay;
  rank: number;
  playerCount: number;
  onSelect: () => void;
}) {
  const label = nightLabel(night.date);
  const counts = countsLine(night, playerCount);
  const freeNames = night.free.map((player) => player.name).join(", ");
  const free = freeNames ? `. Free: ${freeNames}` : "";
  const scheduled = night.session ? ". Session scheduled" : "";
  const hidden = night.free.length - SHOWN_AVATARS;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={`${label}, ${counts}${free}${scheduled}`}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left",
        pressable,
        night.perfect
          ? "bg-free-soft hover:brightness-[0.97] dark:hover:brightness-110"
          : "hover:bg-surface-hover",
      )}
    >
      <span
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold",
          rank === 1 ? "bg-free text-white dark:text-paper" : "bg-surface-2 text-ink-2",
        )}
      >
        {rank}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {label}
          {night.session && <IconStar className="size-3.5 text-accent-strong" />}
        </span>
        <span className="block text-xs text-ink-3">{counts}</span>
      </span>
      <span className="flex shrink-0 items-center -space-x-1">
        {night.free.slice(0, SHOWN_AVATARS).map((player) => (
          <Avatar key={player._id} name={player.name} size="sm" className="ring-2 ring-surface" />
        ))}
        {hidden > 0 && (
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] text-ink-2 ring-2 ring-surface">
            {`+${String(hidden)}`}
          </span>
        )}
      </span>
    </button>
  );
}

function QuickSchedule({
  night,
  focusAfter,
  onSchedule,
}: {
  night: CalendarDay;
  focusAfter: RefObject<HTMLButtonElement | null>;
  onSchedule: (date: IsoDate) => Promise<unknown>;
}) {
  const [scheduling, setScheduling] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const label = nightLabel(night.date);
  useLayoutEffect(
    () => () => {
      if (document.activeElement === button.current) focusAfter.current?.focus();
    },
    [focusAfter],
  );
  const schedule = async () => {
    if (scheduling) return;
    setScheduling(true);
    try {
      await onSchedule(night.date);
    } finally {
      setScheduling(false);
    }
  };
  return (
    <Button
      ref={button}
      size="sm"
      aria-label={`${scheduling ? "Scheduling" : "Schedule"} ${label}`}
      aria-disabled={scheduling || undefined}
      aria-busy={scheduling || undefined}
      onClick={() => void schedule()}
      className="absolute top-1/2 right-2 -translate-y-1/2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:hidden"
    >
      <IconStar className="size-3.5" />
      {scheduling ? "Scheduling…" : "Schedule"}
    </Button>
  );
}

function countsLine(night: CalendarDay, playerCount: number) {
  if (night.perfect) return "Everyone is free";
  const maybe = night.maybe.length > 0 ? `, ${String(night.maybe.length)} maybe` : "";
  return `${String(night.free.length)} of ${String(playerCount)} free${maybe}`;
}
