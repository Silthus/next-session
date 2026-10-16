import type { FunctionArgs } from "convex/server";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { api } from "../../../../convex/_generated/api";
import { errorMessage } from "../../../lib/errors";
import { timeRange, type WallClockTime } from "../../../lib/timeAndPlace";
import { Button } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { IconClock } from "../../../ui/icons";
import { focusRing } from "../../../ui/interactive";
import { LocationField } from "../settings/LocationField";
import { LengthChips, StartTimeField } from "../settings/TimeFields";
import type { CalendarSession } from "./DayCell";

export type TimeAndPlace = WallClockTime & { location?: string };

export type SessionDetailChanges = Omit<
  FunctionArgs<typeof api.sessions.updateDetails>,
  "sessionId"
>;

type DetailField = CalendarSession["overrides"][number];

type DetailValues = { startTime: string; lengthMinutes: number; location: string };

type Draft = { values: DetailValues; own: ReadonlySet<DetailField> };

const DETAIL_FIELDS: readonly DetailField[] = ["startTime", "lengthMinutes", "location"];

export function SessionDetails({
  session,
  usual,
  editing,
  onEdit,
  onDone,
  onSave,
}: {
  session: CalendarSession;
  usual: TimeAndPlace;
  editing: boolean;
  onEdit?: () => void;
  onDone: () => void;
  onSave: (changes: SessionDetailChanges) => Promise<void>;
}) {
  if (editing) {
    return <DetailsEditor session={session} usual={usual} onDone={onDone} onSave={onSave} />;
  }
  return <DetailsLine session={session} timeZone={usual.timeZone} onEdit={onEdit} />;
}

function DetailsLine({
  session,
  timeZone,
  onEdit,
}: {
  session: CalendarSession;
  timeZone: string;
  onEdit?: () => void;
}) {
  const labelId = useId();
  const range = timeRange({ ...session, timeZone });
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-2"
    >
      <IconClock className="mt-0.5 shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        <p id={labelId} className="font-semibold text-ink">
          When and where
        </p>
        <p>{session.location ? `${range} · ${session.location}` : range}</p>
        {session.overrides.length > 0 && <OnlyThisNight className="mt-1" />}
      </div>
      {onEdit && (
        <button
          type="button"
          aria-label="Edit when and where"
          onClick={onEdit}
          className={cn(
            "shrink-0 rounded-sm font-semibold text-accent-strong underline-offset-2 hover:underline",
            focusRing,
          )}
        >
          Edit
        </button>
      )}
    </div>
  );
}

function DetailsEditor({
  session,
  usual,
  onDone,
  onSave,
}: {
  session: CalendarSession;
  usual: TimeAndPlace;
  onDone: () => void;
  onSave: (changes: SessionDetailChanges) => Promise<void>;
}) {
  const [initial] = useState(() => draftOf(session));
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const ids = {
    start: useId(),
    startLabel: useId(),
    lengthLabel: useId(),
    location: useId(),
    locationLabel: useId(),
  };
  const usualValues = valuesOf(usual);

  const change = (patch: Partial<DetailValues>) =>
    setDraft((current) => ({
      values: { ...current.values, ...patch },
      own: new Set([...current.own, ...(Object.keys(patch) as DetailField[])]),
    }));
  const followUsual = (field: DetailField) =>
    setDraft((current) => ({
      values: { ...current.values, [field]: usualValues[field] },
      own: new Set([...current.own].filter((own) => own !== field)),
    }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const changes = changesBetween(initial, draft);
    if (Object.keys(changes).length === 0) {
      onDone();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await onSave(changes);
      onDone();
    } catch (error) {
      setFailure(errorMessage(error, "session"));
      setBusy(false);
    }
  };

  const ownMark = (field: DetailField, usualLabel: string) =>
    draft.own.has(field) && (
      <UsualReset label={usualLabel} onReset={() => followUsual(field)} disabled={busy} />
    );

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex flex-col gap-3 rounded-md bg-surface-2 p-3"
    >
      <DetailRow label="Starts at" labelId={ids.startLabel} htmlFor={ids.start}>
        <StartTimeField
          id={ids.start}
          value={draft.values.startTime}
          onChange={(startTime) => change({ startTime })}
        />
        {ownMark("startTime", "Use the usual start time")}
      </DetailRow>
      <DetailRow label="Plays for" labelId={ids.lengthLabel}>
        <LengthChips
          labelledBy={ids.lengthLabel}
          startTime={draft.values.startTime}
          lengthMinutes={draft.values.lengthMinutes}
          onChange={(lengthMinutes) => change({ lengthMinutes })}
        />
        {ownMark("lengthMinutes", "Use the usual length")}
      </DetailRow>
      <DetailRow label="Where" labelId={ids.locationLabel} htmlFor={ids.location}>
        <LocationField
          id={ids.location}
          value={draft.values.location}
          onChange={(location) => change({ location })}
        />
        {ownMark("location", "Use the usual place")}
      </DetailRow>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" busy={busy && "Saving…"}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
      {failure && (
        <p role="alert" className="text-xs font-medium text-busy">
          {failure}
        </p>
      )}
    </form>
  );
}

function DetailRow({
  label,
  labelId,
  htmlFor,
  children,
}: {
  label: string;
  labelId: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const labelClassName = "text-xs font-semibold text-ink";
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label id={labelId} htmlFor={htmlFor} className={labelClassName}>
          {label}
        </label>
      ) : (
        <span id={labelId} className={labelClassName}>
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

function UsualReset({
  label,
  disabled,
  onReset,
}: {
  label: string;
  disabled: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <OnlyThisNight />
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onReset}
        className={cn(
          "rounded-sm font-semibold text-accent-strong underline-offset-2 hover:underline",
          focusRing,
        )}
      >
        Use the usual
      </button>
    </div>
  );
}

function OnlyThisNight({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-strong",
        className,
      )}
    >
      Only this night
    </span>
  );
}

function valuesOf({
  startTime,
  lengthMinutes,
  location,
}: Pick<TimeAndPlace, DetailField>): DetailValues {
  return { startTime, lengthMinutes, location: location ?? "" };
}

function draftOf(session: CalendarSession): Draft {
  return { values: valuesOf(session), own: new Set(session.overrides) };
}

function changesBetween(initial: Draft, draft: Draft): SessionDetailChanges {
  const changed = DETAIL_FIELDS.filter((field) =>
    draft.own.has(field)
      ? !initial.own.has(field) || draft.values[field] !== initial.values[field]
      : initial.own.has(field),
  );
  return Object.fromEntries(
    changed.map((field) => [field, draft.own.has(field) ? draft.values[field] : null]),
  );
}
