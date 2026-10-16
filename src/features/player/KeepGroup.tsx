import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import type { CalendarInvites } from "../../../convex/sessionMail";
import type { IsoMonth } from "../../../shared/dates";
import { track, type KeepSurface } from "../../lib/telemetry";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { focusRing } from "../../ui/interactive";
import { GoogleLogo, LegalLinks } from "../account/AccountSheet";
import { monthName } from "./playerMonth";

export type KeepState = "offer" | "keeping" | "kept";

export type KeepSessionsOffer = {
  refusal: string | null;
  onKeep: () => void;
  onContinueWithGoogle?: () => void;
  onDismiss: () => void;
};

export const KEEP_NUDGE = {
  title: "Keep this group",
  reasons: [
    "Get a calendar invite for every session.",
    "Find it and your answers on all your devices.",
  ],
};

export const KEEP_SESSIONS = {
  title: "Keep your sessions and get a calendar invite",
  promise: "Every session lands in your calendar.",
};

function trackKeepStarted(groupId: string, surface: KeepSurface) {
  track({ name: "keep_group_started", group_id: groupId, surface });
}

export function KeepGroup({
  groupId,
  state,
  invite,
  refusal,
  calendarInvites,
  email,
  keepStartedOnDoneCard = false,
  onKeep,
  onContinueWithGoogle,
  onDismissNudge,
  onRemove,
}: {
  groupId: string;
  state: KeepState;
  invite: "nudge" | "line";
  refusal: string | null;
  calendarInvites: CalendarInvites;
  email?: string;
  keepStartedOnDoneCard?: boolean;
  onKeep: () => void;
  onContinueWithGoogle?: () => void;
  onDismissNudge?: () => void;
  onRemove?: () => void;
}) {
  const [keepTapped, setKeepTapped] = useState(false);
  const [dismissedHere, setDismissedHere] = useState(false);
  const removedHere = useRemovedHere(state);

  function keep() {
    setKeepTapped(true);
    trackKeepStarted(groupId, invite === "nudge" ? "keep_card" : "keep_line");
    onKeep();
  }

  function continueWithGoogle() {
    trackKeepStarted(groupId, "keep_card");
    onContinueWithGoogle?.();
  }

  return (
    <div className="flex flex-col items-center gap-1 text-center text-sm">
      {state === "kept" ? (
        <>
          <KeptLine focusOnMount={keepTapped || keepStartedOnDoneCard} onRemove={onRemove} />
          <CalendarInvitesLine calendarInvites={calendarInvites} email={email} />
        </>
      ) : invite === "nudge" ? (
        <KeepNudge
          onCreateAccount={keep}
          onContinueWithGoogle={onContinueWithGoogle && continueWithGoogle}
          onDismiss={
            onDismissNudge &&
            (() => {
              setDismissedHere(true);
              onDismissNudge();
            })
          }
        />
      ) : (
        <KeepLine
          keeping={state === "keeping"}
          focusOnMount={removedHere || dismissedHere}
          onKeep={keep}
        />
      )}
      {refusal !== null && (
        <p role="alert" className="max-w-sm font-medium text-busy">
          {refusal}
        </p>
      )}
    </div>
  );
}

function useRemovedHere(state: KeepState) {
  const [previous, setPrevious] = useState(state);
  const [removed, setRemoved] = useState(false);
  if (state !== previous) {
    setPrevious(state);
    setRemoved(previous === "kept");
  }
  return removed;
}

function KeepLine({
  keeping,
  focusOnMount,
  onKeep,
}: {
  keeping: boolean;
  focusOnMount: boolean;
  onKeep: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount) button.current?.focus();
  }, [focusOnMount]);
  return (
    <p className="text-ink-2">
      <button
        ref={button}
        type="button"
        onClick={onKeep}
        disabled={keeping}
        className={`-my-3.5 rounded-sm py-3.5 font-semibold text-accent-strong underline underline-offset-2 hover:text-ink disabled:opacity-60 ${focusRing}`}
      >
        {keeping ? "Keeping…" : "Keep this group"}
      </button>{" "}
      to get calendar invites.
    </p>
  );
}

function KeptLine({ focusOnMount, onRemove }: { focusOnMount: boolean; onRemove?: () => void }) {
  const line = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!focusOnMount) return;
    const focusLine = () => line.current?.focus();
    const openSheet = document.querySelector("dialog[open]");
    if (openSheet === null) {
      focusLine();
      return;
    }
    openSheet.addEventListener("close", focusLine, { once: true });
    return () => openSheet.removeEventListener("close", focusLine);
  }, [focusOnMount]);
  return (
    <p className="text-ink-3">
      <span
        ref={line}
        tabIndex={-1}
        className="outline-none before:mr-1.5 before:text-free before:content-['✓']"
      >
        Kept in My groups
      </span>
      {onRemove && (
        <>
          {" · "}
          <button
            type="button"
            onClick={onRemove}
            className={`-my-3.5 rounded-sm py-3.5 underline underline-offset-2 hover:text-ink ${focusRing}`}
          >
            Remove from my groups
          </button>
        </>
      )}
    </p>
  );
}

function CalendarInvitesLine({
  calendarInvites,
  email,
}: {
  calendarInvites: CalendarInvites;
  email: string | undefined;
}) {
  if (calendarInvites === "on" && email !== undefined)
    return (
      <p className="text-ink-3 [overflow-wrap:anywhere]">{`Calendar invites go to ${email}.`}</p>
    );
  if (calendarInvites !== "off") return null;
  return (
    <p className="text-ink-3">
      Calendar invites are off. Turn them on in{" "}
      <Link
        to="/me"
        className={`-my-3.5 rounded-sm py-3.5 underline underline-offset-2 hover:text-ink ${focusRing}`}
      >
        My groups
      </Link>
      .
    </p>
  );
}

function KeepNudge({
  onCreateAccount,
  onContinueWithGoogle,
  onDismiss,
}: {
  onCreateAccount: () => void;
  onContinueWithGoogle?: () => void;
  onDismiss?: () => void;
}) {
  const title = useId();
  return (
    <Card
      accent
      aria-labelledby={title}
      className="animate-rise flex w-full max-w-sm flex-col gap-3 text-left"
    >
      <div className="flex flex-col gap-1">
        <h2 id={title} className="font-display text-base font-bold text-ink">
          {KEEP_NUDGE.title}
        </h2>
        {KEEP_NUDGE.reasons.map((reason) => (
          <p key={reason} className="text-ink-2">
            {reason}
          </p>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <KeepButtons
          onCreateAccount={onCreateAccount}
          onContinueWithGoogle={onContinueWithGoogle}
        />
        {onDismiss && (
          <Button variant="ghost" size="sm" className="self-center" onClick={onDismiss}>
            Not now
          </Button>
        )}
      </div>
    </Card>
  );
}

export function KeepSessionsCard({
  groupId,
  month,
  nextMonth,
  confirmationRef,
  offer: { refusal, onKeep, onContinueWithGoogle },
  onNotNow,
}: {
  groupId: string;
  month: IsoMonth;
  nextMonth: IsoMonth | null;
  confirmationRef: RefObject<HTMLParagraphElement | null>;
  offer: KeepSessionsOffer;
  onNotNow: () => void;
}) {
  const title = useId();
  return (
    <Card
      accent
      role="status"
      aria-labelledby={title}
      className="animate-rise flex flex-col gap-3 text-left text-sm"
    >
      <p
        ref={confirmationRef}
        tabIndex={-1}
        className="font-semibold text-ink-2 outline-none before:mr-1.5 before:text-free before:content-['✓']"
      >
        {`All set for ${nextMonth ? monthName(month) : "now"}. Your GM sees it.`}
      </p>
      <div className="flex flex-col gap-1">
        <h2 id={title} className="font-display text-lg leading-snug font-semibold text-ink">
          {KEEP_SESSIONS.title}
        </h2>
        <p className="text-ink-2">{KEEP_SESSIONS.promise}</p>
      </div>
      <div className="flex flex-col gap-2">
        <KeepButtons
          onCreateAccount={() => {
            trackKeepStarted(groupId, "done_card");
            onKeep();
          }}
          onContinueWithGoogle={
            onContinueWithGoogle &&
            (() => {
              trackKeepStarted(groupId, "done_card");
              onContinueWithGoogle();
            })
          }
        />
        <Button variant="ghost" size="sm" className="self-center" onClick={onNotNow}>
          {nextMonth ? `Not now, fill ${monthName(nextMonth)} →` : "Not now"}
        </Button>
      </div>
      {refusal !== null && (
        <p role="alert" className="font-medium text-busy">
          {refusal}
        </p>
      )}
    </Card>
  );
}

function KeepButtons({
  onCreateAccount,
  onContinueWithGoogle,
}: {
  onCreateAccount: () => void;
  onContinueWithGoogle?: () => void;
}) {
  return (
    <>
      <Button className="w-full" onClick={onCreateAccount}>
        Create account
      </Button>
      {onContinueWithGoogle && (
        <>
          <Button variant="secondary" className="w-full" onClick={onContinueWithGoogle}>
            <GoogleLogo />
            Continue with Google
          </Button>
          <p className="text-xs text-ink-3">
            By continuing with Google you agree to the <LegalLinks />.
          </p>
        </>
      )}
    </>
  );
}
