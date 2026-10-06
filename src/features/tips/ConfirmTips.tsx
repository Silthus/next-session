import { useState } from "react";
import { TIPS_CONSENT_WORDING } from "../../../shared/tips";
import { appErrorOf } from "../../lib/errors";
import { Button } from "../../ui/Button";
import { Logo } from "../../ui/Logo";
import { PageShell } from "../../ui/PageShell";
import { useFocusOnMount } from "../../ui/useFocusOnMount";

type Confirm = (code: string) => Promise<{ confirmed: boolean }>;

type Outcome = "confirmed" | "expired";

const outcomeLines: Record<Outcome, string> = {
  confirmed: "Done. The first tip arrives in two days.",
  expired: "This link has expired. That's fine, you'll just get no tips.",
};

export function ConfirmTips({ code, confirm }: { code: string | undefined; confirm: Confirm }) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  return (
    <PageShell
      maxWidth="md"
      centerFooter
      className="flex flex-col items-center gap-5 pt-10 text-center"
    >
      <Logo className="size-14" />
      <h1 className="font-display text-3xl font-extrabold text-balance">Two short tips?</h1>
      <p className="text-ink-2 text-balance">You ticked: “{TIPS_CONSENT_WORDING}”.</p>
      {outcome !== null ? (
        <OutcomeLine outcome={outcome} />
      ) : code === undefined ? (
        <p className="text-ink-2">Open the link in your welcome mail again to confirm.</p>
      ) : (
        <Confirmation onConfirm={() => confirm(code)} onOutcome={setOutcome} />
      )}
    </PageShell>
  );
}

function Confirmation({
  onConfirm,
  onOutcome,
}: {
  onConfirm: () => Promise<{ confirmed: boolean }>;
  onOutcome: (outcome: Outcome) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const press = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const { confirmed } = await onConfirm();
      onOutcome(confirmed ? "confirmed" : "expired");
    } catch (error) {
      setFailure(failureMessage(error));
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex w-full flex-col items-center gap-3">
      <Button
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

function OutcomeLine({ outcome }: { outcome: Outcome }) {
  const line = useFocusOnMount<HTMLParagraphElement>();
  return (
    <p ref={line} role="status" tabIndex={-1} className="mt-2 font-semibold text-ink outline-none">
      {outcomeLines[outcome]}
    </p>
  );
}

function failureMessage(error: unknown) {
  return appErrorOf(error)?.code === "RATE_LIMITED"
    ? "Slow down a moment, then try again."
    : "That didn't work. Try again.";
}
