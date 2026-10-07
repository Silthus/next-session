import { useEffect, useId, useRef, useState } from "react";
import { track } from "../../lib/telemetry";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { GoogleLogo, LegalLinks } from "../account/AccountSheet";

export type KeepState = "offer" | "keeping" | "kept";

export const KEEP_NUDGE = {
  title: "Keep this group",
  reasons: ["Find it and your answers on all your devices."],
};

export function KeepGroup({
  groupId,
  state,
  invite,
  refusal,
  onKeep,
  onContinueWithGoogle,
  onDismissNudge,
  onRemove,
}: {
  groupId: string;
  state: KeepState;
  invite: "nudge" | "line";
  refusal: string | null;
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
    track({ name: "keep_group_started", group_id: groupId });
    onKeep();
  }

  function continueWithGoogle() {
    track({ name: "keep_group_started", group_id: groupId });
    onContinueWithGoogle?.();
  }

  return (
    <div className="flex flex-col items-center gap-1 text-center text-sm">
      {state === "kept" ? (
        <KeptLine focusOnMount={keepTapped} onRemove={onRemove} />
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
        className="-my-3.5 py-3.5 font-semibold text-accent-strong underline underline-offset-2 hover:text-ink disabled:opacity-60"
      >
        {keeping ? "Keeping…" : "Keep this group"}
      </button>{" "}
      on all your devices.
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
            className="-my-3.5 py-3.5 underline underline-offset-2 hover:text-ink"
          >
            Remove from my groups
          </button>
        </>
      )}
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
        {onDismiss && (
          <Button variant="ghost" size="sm" className="self-center" onClick={onDismiss}>
            Not now
          </Button>
        )}
      </div>
    </Card>
  );
}
