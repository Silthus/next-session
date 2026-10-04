import { Link } from "@tanstack/react-router";
import { ConvexError } from "convex/values";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { AppErrorData } from "../../../convex/model/errors";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Sheet } from "../../ui/Sheet";
import type { SaveInput, SaveMode } from "./save";

export type AccountIntent = "save" | "logIn";

type Failure = { message: string; offer?: SaveMode };

const MIN_PASSWORD_LENGTH = 8;
const weakPassword: Failure = { message: "Use at least 8 characters for the password." };

type AccountSheetProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: SaveInput) => Promise<unknown>;
} & ({ intent: "save"; groupName: string } | { intent: "logIn" });

export function AccountSheet(props: AccountSheetProps) {
  const { open, onClose } = props;
  const [busy, setBusy] = useState(false);
  const title = props.intent === "save" ? `Keep ${props.groupName}` : "Log in";
  return (
    <Sheet
      open={open}
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {open && <AccountForm {...props} busy={busy} setBusy={setBusy} />}
    </Sheet>
  );
}

function AccountForm({
  busy,
  setBusy,
  ...props
}: AccountSheetProps & { busy: boolean; setBusy: (busy: boolean) => void }) {
  const { intent, onSubmit, onClose } = props;
  const [mode, setMode] = useState<SaveMode>(intent === "save" ? "create" : "logIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const passwordField = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === "create" && password.length < MIN_PASSWORD_LENGTH) {
      setFailure(weakPassword);
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit({ email: email.trim(), password, mode });
      setBusy(false);
      onClose();
    } catch (error) {
      setFailure(describeFailure(error, intent));
      setBusy(false);
    }
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

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <p className="text-ink-2">
        {intent === "save"
          ? "Open it on any device. The player link stays exactly the same, your players notice nothing."
          : "Open your groups on this device."}
      </p>
      <div className="flex flex-col gap-4">
        {intent === "save" && <ModeSwitch mode={mode} disabled={busy} onChange={switchMode} />}
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
        busy={busy && (intent === "save" ? "Saving…" : "Logging in…")}
        className="w-full"
      >
        {submitLabel(intent, mode)}
      </Button>
      <SheetFooter intent={intent} mode={mode} busy={busy} onClose={onClose} />
    </form>
  );
}

function SheetFooter({
  intent,
  mode,
  busy,
  onClose,
}: {
  intent: AccountIntent;
  mode: SaveMode;
  busy: boolean;
  onClose: () => void;
}) {
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
        By creating an account you agree to the{" "}
        <Link to="/terms" className="underline underline-offset-2 hover:text-ink">
          Terms
        </Link>{" "}
        and{" "}
        <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">
          Privacy Policy
        </Link>
        .
      </p>
    );
  }
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
            "flex h-9 cursor-pointer items-center justify-center rounded-sm text-sm font-semibold transition-colors duration-150 has-focus-visible:ring-2 has-focus-visible:ring-accent",
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
  "h-12 w-full rounded-sm border border-line bg-paper px-3 text-base text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

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

function submitLabel(intent: AccountIntent, mode: SaveMode) {
  if (intent === "logIn") return "Log in";
  return mode === "create" ? "Save group" : "Log in and save";
}

function describeFailure(error: unknown, intent: AccountIntent): Failure {
  const data = error instanceof ConvexError ? (error.data as Partial<AppErrorData>) : {};
  switch (data.code) {
    case "WEAK_PASSWORD":
      return weakPassword;
    case "EMAIL_TAKEN":
      return { message: "That email already has an account.", offer: "logIn" };
    case "INVALID_CREDENTIALS":
      return {
        message: "Wrong email or password.",
        offer: intent === "save" ? "create" : undefined,
      };
    case "RATE_LIMITED":
      return { message: `Too many tries. Try again in ${waitFor(data.retryAfter)}.` };
    default:
      return { message: "That didn't work. Try again." };
  }
}

function waitFor(retryAfter: number | undefined) {
  const minutes = Math.ceil((retryAfter ?? 60_000) / 60_000);
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}
