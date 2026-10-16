// PROTOTYPE, throwaway (#127). Never merged. Every calendar-prompt state of the player page
// on fake data, with three variants of the "month done" moment, switchable by ?state= and ?variant=.
import { useEffect, useId, useState, type ReactNode } from "react";
import { fillRestDates, type Answer } from "../../../../shared/answers";
import { monthDays, type IsoDate, type IsoMonth } from "../../../../shared/dates";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { cn } from "../../../ui/cn";
import { focusRing } from "../../../ui/interactive";
import { GoogleLogo, LegalLinks } from "../../account/AccountSheet";
import { HeaderAccount } from "../../group/rail/HeaderAccount";
import { PlayerCalendar, type DoneSlot } from "../PlayerCalendar";
import { monthName } from "../playerMonth";

const TODAY: IsoDate = "2026-10-16";
const MONTH: IsoMonth = "2026-10";
const EMAIL = "ana@example.com";

type Session = { date: IsoDate; label: string; time: string; place: string };
const SESSIONS: Session[] = [
  { date: "2026-10-23", label: "Fri, Oct 23", time: "19:00", place: "Mara's place" },
  { date: "2026-11-06", label: "Fri, Nov 6", time: "19:00", place: "Mara's place" },
];

export const VARIANTS = {
  A: "Done becomes Keep",
  B: "Done, then Keep",
  C: "Next session leads",
} as const;
export type Variant = keyof typeof VARIANTS;

export const STATES = {
  "visitor-answering": "Visitor, still answering",
  "visitor-done": "Visitor, whole month answered",
  "visitor-not-now": "Visitor, after Not now (lands on November)",
  "visitor-nothing-scheduled": "Visitor, month done, no Session yet",
  "account-answering": "Account keeps the Group, still answering",
  "account-done": "Account keeps the Group, month done",
  "account-not-kept": "Account removed the Group from My groups",
} as const;
export type PrototypeState = keyof typeof STATES;

type Who = "visitor" | "account" | "accountNotKept";

const setup: Record<
  PrototypeState,
  { who: Who; full: boolean; sessions: boolean; dismissed: boolean; month?: IsoMonth }
> = {
  "visitor-answering": { who: "visitor", full: false, sessions: true, dismissed: false },
  "visitor-done": { who: "visitor", full: true, sessions: true, dismissed: false },
  "visitor-not-now": {
    who: "visitor",
    full: true,
    sessions: true,
    dismissed: true,
    month: "2026-11",
  },
  "visitor-nothing-scheduled": { who: "visitor", full: true, sessions: false, dismissed: false },
  "account-answering": { who: "account", full: false, sessions: true, dismissed: false },
  "account-done": { who: "account", full: true, sessions: true, dismissed: false },
  "account-not-kept": { who: "accountNotKept", full: true, sessions: true, dismissed: false },
};

const PARTIAL: Record<IsoDate, Answer> = {
  "2026-10-16": "busy",
  "2026-10-17": "free",
  "2026-10-18": "maybe",
  "2026-10-20": "busy",
  "2026-10-23": "free",
  "2026-10-24": "free",
};

function fullMonth(): Record<IsoDate, Answer> {
  const rest = fillRestDates(MONTH, TODAY, new Set(Object.keys(PARTIAL)));
  return { ...PARTIAL, ...Object.fromEntries(rest.map((date) => [date, "busy" as const])) };
}

export function CalendarPromptPrototype({
  state,
  variant,
}: {
  state: PrototypeState;
  variant: Variant;
}) {
  const {
    who,
    full,
    sessions: hasSessions,
    dismissed: startsDismissed,
    month: startMonth = MONTH,
  } = setup[state];
  const [answers, setAnswers] = useState<Record<IsoDate, Answer>>(() =>
    full ? fullMonth() : PARTIAL,
  );
  const [month, setMonth] = useState<IsoMonth>(startMonth);
  const [dismissed, setDismissed] = useState(startsDismissed);
  const sessions = hasSessions ? SESSIONS : [];
  const visitor = who === "visitor";

  useEffect(() => {
    setAnswers(full ? fullMonth() : PARTIAL);
    setDismissed(startsDismissed);
    setMonth(startMonth);
  }, [state, full, startsDismissed, startMonth]);

  const pitchInStrip = visitor && variant === "C" && !dismissed;

  return (
    <PlayerCalendar
      groupId="prototype"
      groupName="Thursday Crew"
      playerName="Ana"
      month={month}
      today={TODAY}
      answers={answers}
      sessionDates={sessions.map(({ date }) => date)}
      hintVisible={false}
      onAnswer={async (date, answer) => {
        setAnswers((current) => {
          const next = { ...current };
          if (answer === null) delete next[date];
          else next[date] = answer;
          return next;
        });
      }}
      onFillRest={async (fillMonth) => {
        setAnswers((current) => {
          const rest = fillRestDates(fillMonth, TODAY, new Set(Object.keys(current)));
          return { ...current, ...Object.fromEntries(rest.map((date) => [date, "busy" as const])) };
        });
      }}
      onMonthChange={setMonth}
      onNotYou={() => undefined}
      onHintToggle={() => undefined}
      accountControl={
        visitor ? (
          <Button variant="ghost" size="sm">
            Log in
          </Button>
        ) : (
          <HeaderAccount status="account" email={EMAIL} onLogOut={() => undefined} />
        )
      }
      aboveProgress={
        sessions.length > 0 && (
          <NextSession
            sessions={sessions}
            who={who}
            pitch={pitchInStrip}
            onDismiss={() => setDismissed(true)}
          />
        )
      }
      doneCard={doneCardFor({ who, variant, dismissed, onDismiss: () => setDismissed(true) })}
      keepGroup={keepAreaFor({
        who,
        variant,
        dismissed,
        done: isDone(answers, month),
        hasSessions: sessions.length > 0,
        onDismiss: () => setDismissed(true),
      })}
    />
  );
}

function isDone(answers: Record<IsoDate, Answer>, month: IsoMonth) {
  return monthDays(month).every((date) => date < TODAY || answers[date] !== undefined);
}

function doneCardFor({
  who,
  variant,
  dismissed,
  onDismiss,
}: {
  who: Who;
  variant: Variant;
  dismissed: boolean;
  onDismiss: () => void;
}): ((done: DoneSlot) => ReactNode) | undefined {
  if (who === "visitor" && variant === "A" && !dismissed) {
    return (done) => <KeepSessionsCard {...done} onDismiss={onDismiss} />;
  }
  return undefined;
}

function keepAreaFor({
  who,
  variant,
  dismissed,
  done,
  hasSessions,
  onDismiss,
}: {
  who: Who;
  variant: Variant;
  dismissed: boolean;
  done: boolean;
  hasSessions: boolean;
  onDismiss: () => void;
}): ReactNode {
  if (who === "account") return <KeptLine />;
  if (who === "accountNotKept") return <KeepLine />;
  if (dismissed) return <KeepLine />;
  if (variant === "C") return hasSessions ? null : <KeepCard onDismiss={onDismiss} />;
  if (variant === "A" && done) return null;
  return <KeepCard onDismiss={onDismiss} />;
}

const invitePromise = "Every session lands in your calendar and moves when your GM moves it.";

function KeepSessionsCard({
  month,
  nextMonth,
  onFillNextMonth,
  onDismiss,
}: DoneSlot & {
  onDismiss: () => void;
}) {
  const title = useId();
  return (
    <Card
      accent
      role="status"
      aria-labelledby={title}
      className="animate-rise flex flex-col gap-3 text-left text-sm"
    >
      <p className="flex items-center gap-1.5 font-semibold text-ink-2">
        <span aria-hidden="true" className="text-free">
          ✓
        </span>
        All set for {monthName(month)}. Your GM sees it.
      </p>
      <div className="flex flex-col gap-1">
        <h2 id={title} className="font-display text-lg leading-snug font-semibold text-ink">
          Keep your sessions and get a calendar invite
        </h2>
        <p className="text-ink-2">{invitePromise}</p>
      </div>
      <AccountButtons />
      <Button
        variant="ghost"
        size="sm"
        className="self-center"
        onClick={() => {
          onDismiss();
          if (nextMonth) onFillNextMonth(nextMonth);
        }}
      >
        {nextMonth ? `Not now, fill ${monthName(nextMonth)} →` : "Not now"}
      </Button>
    </Card>
  );
}

function KeepCard({ onDismiss }: { onDismiss: () => void }) {
  const title = useId();
  return (
    <div className="flex flex-col items-center text-sm">
      <Card
        accent
        aria-labelledby={title}
        className="animate-rise flex w-full max-w-sm flex-col gap-3 text-left"
      >
        <div className="flex flex-col gap-1">
          <h2 id={title} className="font-display text-base font-bold text-ink">
            Keep this group
          </h2>
          <p className="text-ink-2">Get a calendar invite for every session.</p>
          <p className="text-ink-2">Find it and your answers on all your devices.</p>
        </div>
        <AccountButtons />
        <Button variant="ghost" size="sm" className="self-center" onClick={onDismiss}>
          Not now
        </Button>
      </Card>
    </div>
  );
}

function AccountButtons() {
  return (
    <div className="flex flex-col gap-2">
      <Button className="w-full">Create account</Button>
      <Button variant="secondary" className="w-full">
        <GoogleLogo />
        Continue with Google
      </Button>
      <p className="text-xs text-ink-3">
        By continuing with Google you agree to the <LegalLinks />.
      </p>
    </div>
  );
}

function KeepLine() {
  return (
    <p className="text-center text-sm text-ink-2">
      <button
        type="button"
        className={cn(
          "-my-3.5 rounded-sm py-3.5 font-semibold text-accent-strong underline underline-offset-2 hover:text-ink",
          focusRing,
        )}
      >
        Keep this group
      </button>{" "}
      to get calendar invites.
    </p>
  );
}

function KeptLine() {
  return (
    <div className="flex flex-col items-center gap-1 text-center text-sm text-ink-3">
      <p>
        <span className="before:mr-1.5 before:text-free before:content-['✓']">
          Kept in My groups
        </span>
        {" · "}
        <button
          type="button"
          className={cn(
            "-my-3.5 rounded-sm py-3.5 underline underline-offset-2 hover:text-ink",
            focusRing,
          )}
        >
          Remove from my groups
        </button>
      </p>
      <p>Calendar invites go to {EMAIL}.</p>
    </div>
  );
}

function NextSession({
  sessions,
  who,
  pitch,
  onDismiss,
}: {
  sessions: Session[];
  who: Who;
  pitch: boolean;
  onDismiss: () => void;
}) {
  const [next, ...later] = sessions;
  if (!next) return null;
  const kept = who === "account";
  return (
    <section
      aria-label="Next session"
      className="flex flex-col gap-3 rounded-xl border border-accent bg-accent-soft/50 p-3.5 text-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-medium tracking-[0.18em] text-accent-strong uppercase">
            Next session
          </p>
          <p className="font-display text-lg leading-tight font-semibold text-ink">{next.label}</p>
          <p className="text-ink-2">
            {next.time} · {next.place}
            {later.length > 0 && <span className="text-ink-3"> · {later.length} more planned</span>}
          </p>
        </div>
        {kept ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2">
            <span aria-hidden="true" className="text-free">
              ✓
            </span>
            Invite sent
          </span>
        ) : (
          !pitch && (
            <Button variant="secondary" size="sm" className="shrink-0 bg-surface">
              Add to calendar
            </Button>
          )
        )}
      </div>
      {pitch && (
        <div className="flex flex-col gap-2 border-t border-accent/40 pt-3">
          <p className="text-ink-2">
            <span className="font-semibold text-ink">Get the invite.</span> {invitePromise}
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1">
              Create account
            </Button>
            <Button variant="secondary" size="sm" className="flex-1 bg-surface">
              <GoogleLogo />
              Google
            </Button>
          </div>
          <p className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-ink-3">
            <button
              type="button"
              className={cn(
                "-my-2 rounded-sm py-2 underline underline-offset-2 hover:text-ink",
                focusRing,
              )}
            >
              Download once (.ics)
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className={cn("-my-2 rounded-sm py-2 hover:text-ink", focusRing)}
            >
              Not now
            </button>
          </p>
        </div>
      )}
      {!kept && !pitch && (
        <p className="text-xs text-ink-3">
          A one-time copy. Keep this group to get moves and cancellations too.
        </p>
      )}
    </section>
  );
}
