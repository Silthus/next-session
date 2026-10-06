import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState, type RefObject, type TouchEvent } from "react";
import { ANSWERS, nextAnswer, type Answer } from "../../../shared/answers";
import type { IsoDate, IsoMonth } from "../../../shared/dates";
import { pageTitle } from "../../lib/pageTitle";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { LegalFooter } from "../../ui/LegalFooter";
import { Logo } from "../../ui/Logo";
import { IconChevron } from "../../ui/icons";
import { Skeleton } from "../../ui/Skeleton";
import { useFocusOnMount } from "../../ui/useFocusOnMount";
import { Progress } from "./Progress";
import { dayLabel, monthName, playerMonth, type PlayerDay, type PlayerMonth } from "./playerMonth";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const FILL_STAGGER_MS = 26;
const SWIPE_MIN_PX = 50;
const LOCK_TIP = "Past nights lock. Future months unlock two ahead.";
const TIPS = ["Tap again to cycle: free, maybe, busy.", LOCK_TIP];

const answerLabels: Record<Answer, string> = { free: "Free", maybe: "Maybe", busy: "Busy" };
const answerGlyphs: Record<Answer, string> = { free: "✓", maybe: "?", busy: "✕" };
const answerTiles: Record<Answer | "none", string> = {
  free: "border-free bg-free text-white dark:text-paper",
  maybe: "border-maybe bg-maybe text-ink dark:text-paper",
  busy: "border-busy bg-busy text-white dark:text-paper",
  none: "border-line bg-surface text-ink hover:border-line-strong",
};

export function PlayerCalendar({
  groupName,
  playerName,
  month,
  today,
  answers,
  sessionDates,
  hintVisible,
  onAnswer,
  onFillRest,
  onMonthChange,
  onNotYou,
  onHintToggle,
}: {
  groupName: string;
  playerName: string;
  month: IsoMonth;
  today: IsoDate;
  answers: Record<IsoDate, Answer> | undefined;
  sessionDates: IsoDate[];
  hintVisible: boolean;
  onAnswer: (date: IsoDate, answer: Answer | null) => void;
  onFillRest: (month: IsoMonth) => Promise<unknown>;
  onMonthChange: (month: IsoMonth) => void;
  onNotYou: () => void;
  onHintToggle: () => void;
}) {
  const view = playerMonth({ month, today, answers: answers ?? {}, sessionDates });
  const [taps, setTaps] = useState(0);
  const [stagger, setStagger] = useState<ReadonlyMap<IsoDate, number>>(new Map());
  const loaded = answers !== undefined;
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const monthHeading = useRef<HTMLHeadingElement>(null);
  const doneHeading = useRef<HTMLParagraphElement>(null);
  const fillRestSlot = useRef<HTMLDivElement>(null);
  const focusDoneCardWhenDone = useRef(false);
  const focusMonthHeadingWhenShown = useRef(false);
  const refusedFillRestMonth = useRef<IsoMonth | null>(null);
  const [refusedFillRests, setRefusedFillRests] = useState(0);

  useEffect(() => {
    if (!view.done || !focusDoneCardWhenDone.current) return;
    focusDoneCardWhenDone.current = false;
    doneHeading.current?.focus();
  }, [view.done]);

  useEffect(() => {
    const refusedMonth = refusedFillRestMonth.current;
    if (refusedMonth === null || (refusedMonth === month && view.done)) return;
    refusedFillRestMonth.current = null;
    if (refusedMonth === month && focusFellOffThePage()) {
      fillRestSlot.current?.querySelector("button")?.focus();
    }
  }, [month, view.done, refusedFillRests]);

  useEffect(() => {
    if (!focusMonthHeadingWhenShown.current) return;
    focusMonthHeadingWhenShown.current = false;
    monthHeading.current?.focus();
  }, [month]);

  function answer(day: PlayerDay) {
    vibrate(8);
    setTaps((count) => count + 1);
    onAnswer(day.date, nextAnswer(day.answer));
  }

  function fillRest() {
    vibrate([20, 10, 20]);
    setStagger(new Map(view.fillRest.map((date, index) => [date, index])));
    setTimeout(() => setStagger(new Map()), view.fillRest.length * FILL_STAGGER_MS + 300);
    focusDoneCardWhenDone.current = true;
    onFillRest(month).catch(() => {
      refusedFillRestMonth.current = month;
      setRefusedFillRests((count) => count + 1);
    });
  }

  function fillNextMonth(next: IsoMonth) {
    focusMonthHeadingWhenShown.current = true;
    onMonthChange(next);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <title>{pageTitle(groupName)}</title>
      <header className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Logo className="size-9 shrink-0" />
          <div className="min-w-0 leading-tight">
            <h1
              ref={heading}
              tabIndex={-1}
              className="truncate font-display text-lg font-bold outline-none"
            >
              {groupName}
            </h1>
            <p className="text-xs text-ink-3">
              Answering as{" "}
              <span className="inline-block max-w-40 truncate align-bottom font-semibold text-ink">
                {playerName}
              </span>{" "}
              ·{" "}
              <button
                type="button"
                onClick={onNotYou}
                className="-mx-1 -my-3.5 px-1 py-3.5 underline underline-offset-2 hover:text-ink"
              >
                Not you?
              </button>
            </p>
          </div>
        </div>
        {!view.readOnly && (
          <button
            type="button"
            aria-label="How it works"
            aria-expanded={hintVisible}
            onClick={onHintToggle}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-sm font-bold text-ink-2 transition-colors hover:bg-surface-2"
          >
            ?
          </button>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-10 sm:px-5">
        {!view.readOnly &&
          (loaded ? (
            <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
              <Progress {...view.progress} />
            </div>
          ) : (
            <Skeleton className="h-15.5 rounded-lg" />
          ))}

        <MonthCard
          view={view}
          loaded={loaded}
          hintVisible={hintVisible && !view.readOnly}
          headingRef={monthHeading}
          stagger={stagger}
          onAnswer={answer}
          onMonthChange={onMonthChange}
        />

        {!view.readOnly && !loaded && <Skeleton className="h-14 rounded-lg" />}
        {!view.readOnly &&
          loaded &&
          (view.done ? (
            <DoneCard
              month={month}
              nextMonth={view.nextMonth}
              headingRef={doneHeading}
              onFillNextMonth={fillNextMonth}
            />
          ) : (
            <div ref={fillRestSlot}>
              <Button
                variant={view.progress.answered > 0 ? "secondary" : "ghost"}
                size="lg"
                className={cn(
                  "w-full",
                  view.progress.answered > 0 && "border-busy/40! dark:text-busy!",
                )}
                onClick={fillRest}
              >
                <span className="size-3 rounded-full bg-busy" aria-hidden="true" />
                Mark the other {view.fillRest.length} night{view.fillRest.length === 1 ? "" : "s"}{" "}
                busy
              </Button>
            </div>
          ))}

        <Legend />
        <p className="text-center text-xs text-ink-3">
          {view.readOnly ? LOCK_TIP : TIPS[Math.floor(taps / 3) % TIPS.length]}
        </p>
      </main>

      <footer className="mx-auto flex w-full max-w-xl flex-col items-center gap-2 px-4 pb-6 sm:px-5">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center text-xs font-semibold text-accent-strong hover:underline"
        >
          Plan your own game →
        </Link>
        <LegalFooter className="justify-center" />
      </footer>
    </div>
  );
}

function MonthCard({
  view,
  loaded,
  hintVisible,
  headingRef,
  stagger,
  onAnswer,
  onMonthChange,
}: {
  view: PlayerMonth;
  loaded: boolean;
  hintVisible: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  stagger: ReadonlyMap<IsoDate, number>;
  onAnswer: (day: PlayerDay) => void;
  onMonthChange: (month: IsoMonth) => void;
}) {
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const hintDate = view.days.find((day) => !day.locked)?.date;
  const hintId = useId();

  function startSwipe(event: TouchEvent) {
    const touch = event.touches[0];
    swipeStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function endSwipe(event: TouchEvent) {
    const start = swipeStart.current;
    const touch = event.changedTouches[0];
    swipeStart.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx > 0) onMonthChange(view.previousMonth);
    else if (view.nextMonth) onMonthChange(view.nextMonth);
  }

  return (
    <section
      className="rounded-xl border border-line bg-surface p-3 shadow-card sm:p-4"
      onTouchStart={startSwipe}
      onTouchEnd={endSwipe}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2
            ref={headingRef}
            tabIndex={-1}
            aria-live="polite"
            className="font-display text-2xl font-bold outline-none"
          >
            {view.label}
          </h2>
          {view.readOnly && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-ink-2">
              Past · read only
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="size-11! px-0!"
            aria-label="Previous month"
            onClick={() => onMonthChange(view.previousMonth)}
          >
            <IconChevron direction="left" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Next month"
            aria-disabled={view.nextMonth === null}
            className="size-11! px-0! aria-disabled:pointer-events-none aria-disabled:opacity-50"
            onClick={() => view.nextMonth && onMonthChange(view.nextMonth)}
          >
            <IconChevron direction="right" />
          </Button>
        </div>
      </div>
      <div role="group" aria-label={view.label} className="grid grid-cols-7 gap-1 sm:gap-2">
        {WEEKDAYS.map((weekday) => (
          <span
            key={weekday}
            aria-hidden="true"
            className="pb-1 text-center font-mono text-[10px] font-medium tracking-wider text-ink-3 uppercase"
          >
            {weekday}
          </span>
        ))}
        {Array.from({ length: view.leadingBlanks }, (_, index) => (
          <span key={`blank-${String(index)}`} aria-hidden="true" />
        ))}
        {view.days.map((day) =>
          loaded ? (
            <div key={day.date} className="relative">
              <DayTile
                day={day}
                staggerIndex={stagger.get(day.date)}
                describedBy={hintVisible && day.date === hintDate ? hintId : undefined}
                onAnswer={onAnswer}
              />
              {hintVisible && day.date === hintDate && (
                <FirstVisitHint
                  id={hintId}
                  column={(view.leadingBlanks + day.dayOfMonth - 1) % 7}
                />
              )}
            </div>
          ) : (
            <Skeleton key={day.date} className="aspect-square" />
          ),
        )}
      </div>
    </section>
  );
}

function DayTile({
  day,
  staggerIndex,
  describedBy,
  onAnswer,
}: {
  day: PlayerDay;
  staggerIndex: number | undefined;
  describedBy: string | undefined;
  onAnswer: (day: PlayerDay) => void;
}) {
  const [popping, setPopping] = useState(false);

  return (
    <button
      type="button"
      disabled={day.locked}
      aria-label={tileLabel(day)}
      aria-describedby={describedBy}
      onClick={() => {
        setPopping(true);
        onAnswer(day);
      }}
      onAnimationEnd={() => setPopping(false)}
      style={
        staggerIndex === undefined
          ? undefined
          : { transitionDelay: `${String(staggerIndex * FILL_STAGGER_MS)}ms` }
      }
      className={cn(
        "relative flex aspect-square w-full touch-manipulation flex-col items-start justify-between rounded-md border p-1.5 text-left transition-[background-color,border-color,color,transform] duration-150 ease-(--ease-snap) select-none motion-reduce:delay-0! sm:p-2",
        answerTiles[day.answer ?? "none"],
        popping && "animate-pop",
        day.locked ? "cursor-default opacity-45 saturate-50" : "active:scale-95",
        day.session && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
      )}
    >
      <span
        className={cn(
          "text-sm leading-none font-bold sm:text-base",
          day.isToday && !day.answer && "text-accent-strong",
        )}
      >
        {day.dayOfMonth}
      </span>
      {day.answer && (
        <span className="self-end text-sm leading-none font-bold">{answerGlyphs[day.answer]}</span>
      )}
      {day.session && (
        <span className="absolute -top-1.5 -right-1.5 rounded-full bg-accent px-1 text-[9px] leading-4 font-bold text-accent-ink">
          ★
        </span>
      )}
    </button>
  );
}

const hintAnchors = {
  start: { bubble: "left-0", arrow: "left-4" },
  center: { bubble: "left-1/2 -translate-x-1/2", arrow: "left-1/2 -translate-x-1/2" },
  end: { bubble: "right-0", arrow: "right-4" },
};

function hintAnchorFor(column: number) {
  if (column < 3) return hintAnchors.start;
  return column === 3 ? hintAnchors.center : hintAnchors.end;
}

function FirstVisitHint({ id, column }: { id: string; column: number }) {
  const anchor = hintAnchorFor(column);
  return (
    <div
      id={id}
      role="tooltip"
      className={cn(
        "animate-rise pointer-events-none absolute top-full z-10 mt-2 w-52 max-w-[calc(100vw-2rem)] rounded-md bg-ink px-3 py-2 text-xs leading-snug font-medium text-paper shadow-card",
        anchor.bubble,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute -top-1 size-2.5 rotate-45 bg-ink", anchor.arrow)}
      />
      Tap a night you can play. Tap again for maybe, then busy.
    </div>
  );
}

function DoneCard({
  month,
  nextMonth,
  headingRef,
  onFillNextMonth,
}: {
  month: IsoMonth;
  nextMonth: IsoMonth | null;
  headingRef: RefObject<HTMLParagraphElement | null>;
  onFillNextMonth: (month: IsoMonth) => void;
}) {
  return (
    <div
      role="status"
      className="animate-rise flex flex-col gap-2 rounded-lg border border-free bg-free-soft p-4 text-center"
    >
      <p
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-lg font-bold text-ink outline-none dark:text-free"
      >
        {nextMonth ? `All set for ${monthName(month)} ✓` : "All set for now ✓"}
      </p>
      <p className="text-sm text-ink-2">Your GM sees it already.</p>
      {nextMonth && (
        <Button
          variant="free"
          size="lg"
          className="mt-1"
          onClick={() => onFillNextMonth(nextMonth)}
        >
          Fill {monthName(nextMonth)} →
        </Button>
      )}
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-ink-2">
      {ANSWERS.map((answer) => (
        <li key={answer} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex size-5 items-center justify-center rounded-sm text-[10px] font-bold",
              answerTiles[answer],
            )}
          >
            {answerGlyphs[answer]}
          </span>
          {answerLabels[answer]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block size-5 rounded-sm border border-line bg-surface"
        />
        Not set
      </li>
    </ul>
  );
}

function tileLabel(day: PlayerDay): string {
  const answer = day.answer ? answerLabels[day.answer] : "Not set";
  return `${dayLabel(day.date)}: ${answer}${day.session ? ", Session" : ""}`;
}

function focusFellOffThePage() {
  return document.activeElement === null || document.activeElement === document.body;
}

function vibrate(pattern: number | number[]) {
  if ("vibrate" in navigator) navigator.vibrate(pattern);
}
