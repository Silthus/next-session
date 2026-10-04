import { addMonths, monthOf, type IsoDate, type IsoMonth } from "../../../../shared/dates";
import type { PlayerRow } from "../../../../shared/monthSummary";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { lastVisibleMonth, leadingBlanks, monthLabel, WEEKDAYS } from "./calendarDates";
import { DayCell, MAX_PLAYERS_WITH_BARS, type CalendarDay } from "./DayCell";
import { IconChevron, IconStar } from "./icons";

export function HeatCalendar({
  month,
  today,
  players,
  days,
  selectedDay,
  onSelectDay,
  onMonthChange,
}: {
  month: IsoMonth;
  today: IsoDate;
  players: readonly PlayerRow[];
  days: readonly CalendarDay[];
  selectedDay: IsoDate | null;
  onSelectDay: (day: IsoDate | null) => void;
  onMonthChange: (month: IsoMonth) => void;
}) {
  return (
    <Card className="p-3 sm:p-5">
      <MonthHeader month={month} today={today} onMonthChange={onMonthChange} />
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((weekday) => (
          <span
            key={weekday}
            aria-hidden="true"
            className="pb-1 text-center font-mono text-[10px] font-medium tracking-wider text-ink-3 uppercase"
          >
            {weekday}
          </span>
        ))}
        {Array.from({ length: leadingBlanks(month) }, (_, i) => (
          <span key={`blank-${String(i)}`} />
        ))}
        {days.map((day) => (
          <DayCell
            key={day.date}
            day={day}
            players={players}
            today={today}
            selected={day.date === selectedDay}
            onToggle={() => onSelectDay(day.date === selectedDay ? null : day.date)}
          />
        ))}
      </div>
      <Legend dense={players.length > MAX_PLAYERS_WITH_BARS} />
    </Card>
  );
}

function MonthHeader({
  month,
  today,
  onMonthChange,
}: {
  month: IsoMonth;
  today: IsoDate;
  onMonthChange: (month: IsoMonth) => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="font-display text-xl font-bold sm:text-2xl">{monthLabel(month)}</h2>
        {month < monthOf(today) && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-3">
            Past month
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Previous month"
          onClick={() => onMonthChange(addMonths(month, -1))}
        >
          <IconChevron direction="left" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Next month"
          disabled={month >= lastVisibleMonth(today)}
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <IconChevron direction="right" />
        </Button>
      </div>
    </div>
  );
}

function Legend({ dense }: { dense: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-free" /> everyone free
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="size-3 rounded-sm border border-line"
          style={{ background: "color-mix(in oklab, var(--free) 30%, var(--surface))" }}
        />
        some free
      </span>
      <span className="flex items-center gap-1.5">
        <IconStar className="size-3 text-accent" /> session
      </span>
      {dense ? (
        <span className="flex items-center gap-1.5">
          <span className="font-mono">
            7<span className="max-sm:hidden">/12</span> <span className="text-busy">✕2</span>
          </span>
          <span>free of all · busy</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <span className="flex gap-0.5">
            <span className="h-3 w-1 rounded-full bg-free" />
            <span className="h-3 w-1 rounded-full bg-maybe" />
            <span className="h-3 w-1 rounded-full bg-busy" />
          </span>
          <span>one bar per player</span>
        </span>
      )}
    </div>
  );
}
