import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TIPS_CONSENT_WORDING } from "../../../shared/tips";
import { appErrorOf } from "../../lib/errors";
import { Button, buttonClassName } from "../../ui/Button";
import type { TipsConfirmation } from "../../../convex/model/tips";
import { StatusScreen } from "../../ui/StatusScreen";

type Confirm = (code: string) => Promise<TipsConfirmation>;

type Outcome = "confirmed" | "alreadyConfirmed" | "expired";

const outcomes: Record<Outcome, { headline: string; explanation: string }> = {
  confirmed: { headline: "Done", explanation: "The first tip arrives in two days." },
  alreadyConfirmed: {
    headline: "Already confirmed",
    explanation: "You asked for the tips already. Nothing more to do.",
  },
  expired: {
    headline: "This link has expired",
    explanation: "That's fine, you'll just get no tips.",
  },
};

const ASKING_HEADLINE = "Two short tips?";

export function ConfirmTips({ code, confirm }: { code: string | undefined; confirm: Confirm }) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  if (outcome !== null) {
    return (
      <StatusScreen key={outcome} {...outcomes[outcome]}>
        <Link to="/" className={buttonClassName("secondary", "md", "mt-2")}>
          Open Next Session
        </Link>
      </StatusScreen>
    );
  }
  if (code === undefined) {
    return (
      <StatusScreen
        headline={ASKING_HEADLINE}
        explanation="Open the link in your welcome mail again to confirm."
      >
        {null}
      </StatusScreen>
    );
  }
  return (
    <StatusScreen headline={ASKING_HEADLINE} explanation={`You ticked: “${TIPS_CONSENT_WORDING}”.`}>
      <Confirmation onConfirm={() => confirm(code)} onOutcome={setOutcome} />
    </StatusScreen>
  );
}

function Confirmation({
  onConfirm,
  onOutcome,
}: {
  onConfirm: () => Promise<TipsConfirmation>;
  onOutcome: (outcome: Outcome) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (failure !== null) button.current?.focus();
  }, [failure]);

  const press = async () => {
    setBusy(true);
    setFailure(null);
    try {
      onOutcome(outcomeOf(await onConfirm()));
    } catch (error) {
      setFailure(failureMessage(error));
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex w-full flex-col items-center gap-3">
      <Button
        ref={button}
        size="lg"
        busy={busy && "Confirming…"}
        onClick={() => void press()}
        className="w-full"
      >
        Yes, send me the tips
      </Button>
      {failure && (
        <p role="alert" className="text-sm font-medium text-busy">
          {failure}
        </p>
      )}
      <p className="text-xs text-ink-3">
        Didn't ask for them? Close this page, and nothing gets sent.
      </p>
    </div>
  );
}

function outcomeOf({ confirmed, alreadyConfirmed }: TipsConfirmation): Outcome {
  if (alreadyConfirmed) return "alreadyConfirmed";
  return confirmed ? "confirmed" : "expired";
}

function failureMessage(error: unknown) {
  return appErrorOf(error)?.code === "RATE_LIMITED"
    ? "Slow down a moment, then try again."
    : "That didn't work. Try again.";
}
