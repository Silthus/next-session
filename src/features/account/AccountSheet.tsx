import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { AppErrorData, ErrorCode } from "../../../convex/model/errors";
import { MAX_GROUPS_PER_GM } from "../../../shared/limits";
import { appErrorOf } from "../../lib/errors";
import { track } from "../../lib/telemetry";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Sheet } from "../../ui/Sheet";
import { PASSWORD_FLOWS, type SaveInput, type SaveMode } from "./save";

export type AccountIntent = "save" | "keep" | "logIn";

type Failure = { message: string; offer?: SaveMode; claimExpired?: boolean };

const MIN_PASSWORD_LENGTH = 8;
const weakPassword: Failure = { message: "Use at least 8 characters for the password." };
const SIGN_IN_REFUSALS: ReadonlySet<ErrorCode> = new Set([
  "WEAK_PASSWORD",
  "EMAIL_TAKEN",
  "INVALID_CREDENTIALS",
  "RATE_LIMITED",
]);

type AccountSheetProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: SaveInput) => Promise<unknown>;
  onContinueWithGoogle?: () => Promise<unknown>;
} & (
  | {
      intent: "save";
      groupName: string;
      signedInAs?: string;
      refusal?: unknown;
      onFinish: () => Promise<unknown>;
    }
  | { intent: "keep"; groupName: string; playerName: string; movesGroups?: boolean }
  | { intent: "logIn"; forPlayer?: boolean }
);

export function AccountSheet(props: AccountSheetProps) {
  const { open, onClose } = props;
  const [busy, setBusy] = useState(false);
  const [finishingAs, setFinishingAs] = useState<string | null>(null);
  const signedInAs = props.intent === "save" ? props.signedInAs : undefined;
  if (!open && finishingAs !== null) setFinishingAs(null);
  if (open && signedInAs && !busy && finishingAs === null) {
    setFinishingAs(signedInAs);
  }

  const dismiss = () => {
    if (props.intent === "save" && finishingAs !== null) {
      finishInBackground(props.onFinish);
    }
    onClose();
  };

  const title = props.intent === "logIn" ? "Log in" : `Keep ${props.groupName}`;
  return (
    <Sheet open={open} title={title} dismissible={!busy} onClose={dismiss}>
      {open && <AccountForm {...props} busy={busy} setBusy={setBusy} finishingAs={finishingAs} />}
    </Sheet>
  );
}

function finishInBackground(finish: () => Promise<unknown>) {
  finish().catch(() => undefined);
}

function AccountForm({
  busy,
  setBusy,
  finishingAs,
  ...props
}: AccountSheetProps & {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  finishingAs: string | null;
}) {
  const { intent, onSubmit, onClose, onContinueWithGoogle } = props;
  const [mode, setMode] = useState<SaveMode>(intent === "logIn" ? "logIn" : "create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<Failure | null>(() =>
    props.intent === "save" && props.refusal !== undefined
      ? describeFailure(props.refusal, intent)
      : null,
  );
  const [leavingForGoogle, setLeavingForGoogle] = useState(false);
  const passwordField = useRef<HTMLInputElement>(null);

  const attempt = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      return true;
    } catch (error) {
      setFailure(describeFailure(error, intent));
      setBusy(false);
      return false;
    }
  };

  const run = async (action: () => Promise<unknown>) => {
    if (!(await attempt(action))) return;
    setBusy(false);
    onClose();
  };

  useEffect(() => {
    const wakeUpFromBackForwardCache = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setLeavingForGoogle(false);
      setBusy(false);
    };
    window.addEventListener("pageshow", wakeUpFromBackForwardCache);
    return () => window.removeEventListener("pageshow", wakeUpFromBackForwardCache);
  }, [setBusy]);

  const leaveForGoogle = async (continueWithGoogle: () => Promise<unknown>) => {
    setLeavingForGoogle(true);
    if (!(await attempt(continueWithGoogle))) setLeavingForGoogle(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (mode === "create" && password.length < MIN_PASSWORD_LENGTH) {
      setFailure(weakPassword);
      return;
    }
    void run(() =>
      onSubmit({ email: email.trim(), password, mode }).catch((error: unknown) => {
        trackRefusedSignIn(error, mode);
        throw error;
      }),
    );
  };

  const switchMode = (next: SaveMode) => {
    setMode(next);
    setFailure(null);
  };

  const takeOffer = (next: SaveMode) => {
    switchMode(next);
    passwordField.current?.focus();
  };

  const offer = failure?.offer;

  if (finishingAs !== null && props.intent === "save") {
    return (
      <FinishSave
        email={finishingAs}
        groupName={props.groupName}
        failure={failure}
        busy={busy}
        onFinish={() => void run(props.onFinish)}
        onClose={onClose}
      />
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Intro {...props} />
      {onContinueWithGoogle && (
        <GoogleOption
          busy={busy}
          leaving={leavingForGoogle}
          onContinue={() => void leaveForGoogle(onContinueWithGoogle)}
        />
      )}
      <div className="flex flex-col gap-4">
        {intent !== "logIn" && <ModeSwitch mode={mode} disabled={busy} onChange={switchMode} />}
        <Field label="Email">
          {({ id }) => (
            <input
              id={id}
              type="email"
              required
              autoComplete="email"
              value={email}
              readOnly={busy}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className={inputClassName}
            />
          )}
        </Field>
        <Field label="Password" hint={mode === "create" ? "At least 8 characters." : undefined}>
          {({ id, hintId }) => (
            <input
              ref={passwordField}
              id={id}
              aria-describedby={hintId}
              type="password"
              required
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              value={password}
              readOnly={busy}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClassName}
            />
          )}
        </Field>
      </div>
      {failure && (
        <div className="flex flex-wrap items-center gap-x-2 text-sm">
          <p role="alert" className="font-medium text-busy">
            {failure.message}
          </p>
          {offer && (
            <button
              type="button"
              onClick={() => takeOffer(offer)}
              className="font-semibold text-accent-strong underline underline-offset-2"
            >
              {offer === "logIn" ? "Log in instead" : "Create account instead"}
            </button>
          )}
        </div>
      )}
      <Button
        type="submit"
        size="lg"
        disabled={busy}
        busy={busy && !leavingForGoogle && busyLabels[intent]}
        className="w-full"
      >
        {submitLabel(intent, mode)}
      </Button>
      <SheetFooter
        intent={intent}
        mode={mode}
        busy={busy}
        forPlayer={props.intent === "logIn" && props.forPlayer === true}
        onClose={onClose}
      />
    </form>
  );
}

const busyLabels: Record<AccountIntent, string> = {
  save: "Saving…",
  keep: "Keeping…",
  logIn: "Logging in…",
};

function Intro(props: AccountSheetProps) {
  if (props.intent === "save") {
    return (
      <p className="text-ink-2">
        Open it on any device. The player link stays exactly the same, your players notice nothing.
      </p>
    );
  }
  if (props.intent === "keep") {
    return (
      <div className="flex flex-col gap-1 text-ink-2">
        <p className="min-w-0 break-words">Open it as {props.playerName} on any device.</p>
        {props.movesGroups && <p>Your own groups move to the account too.</p>}
      </div>
    );
  }
  return (
    <p className="text-ink-2">
      {props.forPlayer
        ? "Open the groups you kept on this device."
        : "Open your groups on this device."}
    </p>
  );
}

function GoogleOption({
  busy,
  leaving,
  onContinue,
}: {
  busy: boolean;
  leaving: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Button
          variant="secondary"
          size="lg"
          disabled={busy}
          busy={leaving && "Opening Google…"}
          onClick={onContinue}
          className="w-full"
        >
          <GoogleLogo />
          Continue with Google
        </Button>
        <p className="text-xs text-ink-3">
          By continuing with Google you agree to the <LegalLinks />.
        </p>
      </div>
      <p className="flex items-center gap-3 text-xs text-ink-3 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        or with email
      </p>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-5">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function LegalLinks() {
  return (
    <>
      <Link to="/terms" className="underline underline-offset-2 hover:text-ink">
        Terms
      </Link>{" "}
      and{" "}
      <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">
        Privacy Policy
      </Link>
    </>
  );
}

function FinishSave({
  email,
  groupName,
  failure,
  busy,
  onFinish,
  onClose,
}: {
  email: string;
  groupName: string;
  failure: Failure | null;
  busy: boolean;
  onFinish: () => void;
  onClose: () => void;
}) {
  const claimExpired = failure?.claimExpired;
  const finish = (event: FormEvent) => {
    event.preventDefault();
    if (claimExpired) onClose();
    else onFinish();
  };
  return (
    <form onSubmit={finish} className="flex flex-col gap-4">
      <p className="min-w-0 break-words text-ink-2">
        Signed in as <span className="font-semibold break-all text-ink">{email}</span>. Finish
        moving {groupName} to your account.
      </p>
      {failure && (
        <p role="alert" className="text-sm font-medium text-busy">
          {failure.message}
        </p>
      )}
      <Button autoFocus type="submit" size="lg" busy={busy && "Saving…"} className="w-full">
        {claimExpired ? "Close" : "Finish saving"}
      </Button>
    </form>
  );
}

function SheetFooter({
  intent,
  mode,
  busy,
  forPlayer,
  onClose,
}: {
  intent: AccountIntent;
  mode: SaveMode;
  busy: boolean;
  forPlayer: boolean;
  onClose: () => void;
}) {
  if (intent === "logIn" && forPlayer) {
    return <p className="text-xs text-ink-3">No account yet? You can answer without one.</p>;
  }
  if (intent === "logIn") {
    return (
      <p className="text-xs text-ink-3">
        No account yet?{" "}
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="font-semibold text-ink-2 underline underline-offset-2 hover:text-ink disabled:opacity-50"
        >
          Go back
        </button>{" "}
        and create your link.
      </p>
    );
  }
  if (mode === "create") {
    return (
      <p className="text-xs text-ink-3">
        By creating an account you agree to the <LegalLinks />.
      </p>
    );
  }
  if (intent === "keep") return null;
  return (
    <p className="text-xs text-ink-3">
      Logging in adds this group to your account. Nothing gets replaced.
    </p>
  );
}

const modes: { mode: SaveMode; label: string }[] = [
  { mode: "create", label: "Create account" },
  { mode: "logIn", label: "I already have one" },
];

function ModeSwitch({
  mode,
  disabled,
  onChange,
}: {
  mode: SaveMode;
  disabled: boolean;
  onChange: (mode: SaveMode) => void;
}) {
  const name = useId();
  return (
    <fieldset
      disabled={disabled}
      className="grid grid-cols-2 gap-1 rounded-md bg-surface-2 p-1 disabled:pointer-events-none disabled:opacity-50"
    >
      <legend className="sr-only">Account</legend>
      {modes.map((option) => (
        <label
          key={option.mode}
          className={cn(
            "flex h-9 cursor-pointer items-center justify-center rounded-sm text-sm font-semibold transition-colors duration-150 has-focus-visible:ring-2 has-focus-visible:ring-accent-strong",
            mode === option.mode ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.mode}
            checked={mode === option.mode}
            onChange={() => onChange(option.mode)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

const inputClassName =
  "h-12 w-full rounded-sm border border-line bg-paper px-3 text-base text-ink placeholder:text-ink-3 focus:border-accent-strong focus:outline-none focus:ring-2 focus:ring-accent-strong/30";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (ids: { id: string; hintId?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children({ id, hintId })}
      {hint && (
        <p id={hintId} className="text-xs text-ink-3">
          {hint}
        </p>
      )}
    </div>
  );
}

const submitLabels: Record<AccountIntent, Record<SaveMode, string>> = {
  save: { create: "Save group", logIn: "Log in and save" },
  keep: { create: "Keep group", logIn: "Log in and keep" },
  logIn: { create: "Log in", logIn: "Log in" },
};

function submitLabel(intent: AccountIntent, mode: SaveMode) {
  return submitLabels[intent][mode];
}

function trackRefusedSignIn(error: unknown, mode: SaveMode) {
  const code = appErrorOf(error)?.code;
  if (code === undefined || !SIGN_IN_REFUSALS.has(code)) return;
  track({ name: "sign_in_failed", flow: PASSWORD_FLOWS[mode], code });
}

function describeFailure(error: unknown, intent: AccountIntent): Failure {
  const data: Partial<AppErrorData> = appErrorOf(error) ?? {};
  switch (data.code) {
    case "WEAK_PASSWORD":
      return weakPassword;
    case "EMAIL_TAKEN":
      return { message: "That email already has an account.", offer: "logIn" };
    case "INVALID_CREDENTIALS":
      return {
        message: "Wrong email or password.",
        offer: intent === "logIn" ? undefined : "create",
      };
    case "RATE_LIMITED":
      return { message: `Too many tries. Try again in ${waitFor(data.retryAfter)}.` };
    case "TOO_MANY_GROUPS":
      return {
        message: `An account holds up to ${String(MAX_GROUPS_PER_GM)} groups. Delete some to make room, then finish saving.`,
      };
    case "CLAIM_INVALID":
      return {
        message: "This save expired before the group moved. Close this and create a new link.",
        claimExpired: true,
      };
    default:
      return { message: "That didn't work. Try again." };
  }
}

function waitFor(retryAfter: number | undefined) {
  const minutes = Math.ceil((retryAfter ?? 60_000) / 60_000);
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}
