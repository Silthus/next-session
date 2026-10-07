import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { normalizeName, NAME_MAX_LENGTH } from "../../../../shared/names";
import { Button } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { codeMessage, errorMessage, type ErrorTopic } from "../../../lib/errors";
import { isImeComposing } from "../../../lib/keyboard";

export function NameForm({
  label,
  autoFocus = true,
  focusRequest = 0,
  initialName = "",
  readyForNextAfterSubmit = false,
  placeholder,
  submitLabel,
  topic,
  onSubmit,
  onCancel,
  className,
  inputClassName,
}: {
  label: string;
  autoFocus?: boolean;
  focusRequest?: number;
  initialName?: string;
  readyForNextAfterSubmit?: boolean;
  placeholder?: string;
  submitLabel: string;
  topic: ErrorTopic;
  onSubmit: (name: string) => Promise<unknown>;
  onCancel: () => void;
  className?: string;
  inputClassName?: string;
}) {
  const [name, setName] = useState(initialName);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const failureId = useId();

  useEffect(() => {
    if (!autoFocus) return;
    field.current?.focus();
    field.current?.select();
  }, [autoFocus, focusRequest]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const normalized = normalizeName(name);
    if (normalized === "INVALID_NAME") {
      setFailure(codeMessage("INVALID_NAME", topic));
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit(normalized.name);
      if (readyForNextAfterSubmit) readyForNextName();
    } catch (error) {
      setFailure(errorMessage(error, topic));
      setBusy(false);
      field.current?.focus();
    }
  };

  const readyForNextName = () => {
    setName("");
    setBusy(false);
    field.current?.focus();
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || isImeComposing(event.nativeEvent)) return;
        event.stopPropagation();
        if (!busy) onCancel();
      }}
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <label htmlFor={fieldId} className="sr-only">
          {label}
        </label>
        <input
          ref={field}
          id={fieldId}
          value={name}
          maxLength={NAME_MAX_LENGTH * 2}
          placeholder={placeholder}
          autoComplete="off"
          readOnly={busy}
          aria-invalid={failure !== null || undefined}
          aria-describedby={failure ? failureId : undefined}
          onChange={(event) => setName(event.target.value)}
          className={cn(
            "h-9 min-w-0 flex-1 rounded-md border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-accent-strong aria-invalid:border-busy",
            inputClassName,
          )}
        />
        <Button size="sm" type="submit" variant="secondary" busy={busy && "Saving…"}>
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
      {failure && (
        <p id={failureId} role="alert" className="text-xs font-medium text-busy">
          {failure}
        </p>
      )}
    </form>
  );
}
