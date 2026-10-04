import { Link } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { Button, buttonClassName } from "../../ui/Button";
import { IconCheck } from "../../ui/icons";
import { LegalFooter } from "../../ui/LegalFooter";
import { ShareLinkCard } from "../../ui/ShareLinkCard";
import { Wordmark } from "../../ui/Wordmark";
import { DemoStrip } from "./DemoStrip";

export type LandingState =
  | { phase: "idle" | "creating" | "failed" }
  | { phase: "created"; shareUrl: string; groupId: string; savedAs?: string };

type LandingViewProps = {
  state: LandingState;
  showLogIn: boolean;
  onCreate: () => void;
  onLogIn: () => void;
  onSave: () => void;
  onOpenGroup: (groupId: string) => void;
};

const column = "mx-auto w-full max-w-5xl px-4 sm:px-6";
const steps = ["Create your link", "Send it to the group", "Pick the best night"];

export function LandingView({
  state,
  showLogIn,
  onCreate,
  onLogIn,
  onSave,
  onOpenGroup,
}: LandingViewProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className={`${column} flex items-center justify-between py-5`}>
        <Wordmark />
        {showLogIn && (
          <Button variant="ghost" size="sm" onClick={onLogIn}>
            Log in
          </Button>
        )}
      </header>
      <main
        className={`${column} flex flex-1 flex-col justify-center gap-10 pt-6 pb-16 lg:flex-row lg:items-center lg:gap-16`}
      >
        <section className="flex max-w-xl flex-col gap-6">
          <h1 className="font-display text-5xl leading-[0.98] font-extrabold tracking-tight text-ink sm:text-6xl lg:text-7xl">
            Stop chasing <br />
            the date.
          </h1>
          <p className="max-w-md text-lg text-ink-2">
            One link for your group. Players tap the nights they can play, no accounts. The free
            nights fall out by themselves.
          </p>
          {state.phase === "created" ? (
            <LinkInHand {...state} onSave={onSave} onOpenGroup={onOpenGroup} />
          ) : (
            <CreateLink phase={state.phase} onCreate={onCreate} />
          )}
          <Steps />
        </section>
        <aside className="w-full max-w-md self-center lg:ml-auto">
          <DemoStrip />
        </aside>
      </main>
      <LegalFooter className={`${column} pb-6`} />
    </div>
  );
}

function CreateLink({
  phase,
  onCreate,
}: {
  phase: "idle" | "creating" | "failed";
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Button
        size="lg"
        onClick={onCreate}
        busy={phase === "creating" && "Making your link…"}
        className="w-full text-lg sm:w-auto sm:max-w-sm sm:min-w-64"
      >
        Create your link
      </Button>
      {phase === "failed" && (
        <p role="alert" className="text-sm font-medium text-busy">
          That didn't work. Try again.
        </p>
      )}
      <p className="max-w-sm text-xs text-ink-3">
        No sign-up. By creating a link you agree to the{" "}
        <Link to="/terms" className="underline underline-offset-2 hover:text-ink">
          Terms
        </Link>{" "}
        and{" "}
        <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}

function LinkInHand({
  shareUrl,
  groupId,
  savedAs,
  onSave,
  onOpenGroup,
}: {
  shareUrl: string;
  groupId: string;
  savedAs?: string;
  onSave: () => void;
  onOpenGroup: (groupId: string) => void;
}) {
  const openGroup = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onOpenGroup(groupId);
  };

  return (
    <div className="flex max-w-lg animate-rise flex-col gap-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-free">
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-free text-white dark:text-paper">
          <IconCheck className="size-3.5" />
        </span>
        Your link is ready. Send it to your players.
      </p>
      <ShareLinkCard url={shareUrl} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <a
          href={`/g/${groupId}`}
          onClick={openGroup}
          className={buttonClassName("secondary", "lg", "self-start")}
        >
          Open your group →
        </a>
        <p className="text-xs text-ink-3">
          {savedAs ? (
            `Saved to ${savedAs}.`
          ) : (
            <>
              You can name it there, or{" "}
              <button
                type="button"
                onClick={onSave}
                className="font-semibold text-ink-2 underline underline-offset-2 hover:text-ink"
              >
                save it to an account
              </button>{" "}
              now.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Steps() {
  return (
    <ol className="mt-2 flex flex-col gap-2 text-sm text-ink-2 sm:flex-row sm:gap-6">
      {steps.map((step, index) => (
        <li key={step} className="flex items-center gap-2">
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[11px] font-semibold text-ink">
            {index + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}
