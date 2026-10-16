import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { IsoDate } from "../../../../shared/dates";
import { errorMessage } from "../../../lib/errors";
import { timeRange } from "../../../lib/timeAndPlace";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { cn } from "../../../ui/cn";
import { Eyebrow } from "../../../ui/Eyebrow";
import { dayLabel } from "../calendar/calendarDates";
import { LocationField, locationHint } from "./LocationField";
import { LengthChips, StartTimeField } from "./TimeFields";
import { TimeZoneLine } from "./TimeZoneLine";

export type TimeAndPlaceValues = {
  startTime: string;
  lengthMinutes: number;
  timeZone: string;
  location: string;
};

export function TimeAndPlacePage({
  groupName,
  previewDate,
  initial,
  onSave,
}: {
  groupName: string;
  previewDate: IsoDate;
  initial: TimeAndPlaceValues;
  onSave: (values: TimeAndPlaceValues) => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const save = useSave(onSave);
  const change = (patch: Partial<TimeAndPlaceValues>) =>
    setValues((current) => ({ ...current, ...patch }));
  const ids = { start: useId(), length: useId(), location: useId(), hint: useId() };

  return (
    <form
      onSubmit={(event) => void save.submit(event, values)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div>
        <Eyebrow>Group settings</Eyebrow>
        <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">
          When and where you play
        </h1>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <div className="lg:sticky lg:top-20 lg:order-2">
          <CalendarPreview groupName={groupName} date={previewDate} values={values} />
        </div>
        <Card className="divide-y divide-line p-0 lg:order-1">
          <Row label={<label htmlFor={ids.start}>Starts at</label>}>
            <StartTimeField
              id={ids.start}
              value={values.startTime}
              onChange={(startTime) => change({ startTime })}
            />
            <div className="mt-2">
              <TimeZoneLine value={values.timeZone} onChange={(timeZone) => change({ timeZone })} />
            </div>
          </Row>
          <Row label={<span id={ids.length}>Plays for</span>}>
            <LengthChips
              labelledBy={ids.length}
              startTime={values.startTime}
              lengthMinutes={values.lengthMinutes}
              onChange={(lengthMinutes) => change({ lengthMinutes })}
            />
          </Row>
          <Row
            label={<label htmlFor={ids.location}>Where</label>}
            hint={<span id={ids.hint}>{locationHint}</span>}
          >
            <LocationField
              id={ids.location}
              describedBy={ids.hint}
              value={values.location}
              onChange={(location) => change({ location })}
            />
          </Row>
        </Card>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" busy={save.busy && "Saving…"}>
          Save
        </Button>
        <p className="text-xs text-ink-3">Upcoming Sessions move in players' calendars.</p>
      </div>
      {save.failure && (
        <p role="alert" className="text-sm font-medium text-busy">
          {save.failure}
        </p>
      )}
    </form>
  );
}

function useSave(onSave: (values: TimeAndPlaceValues) => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);
  const submit = async (event: FormEvent, values: TimeAndPlaceValues) => {
    event.preventDefault();
    if (started.current) return;
    started.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await onSave(values);
    } catch (error) {
      setFailure(errorMessage(error, "timeAndPlace"));
      started.current = false;
      setBusy(false);
    }
  };
  return { busy, failure, submit };
}

function Row({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 p-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4 sm:p-5">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-3 sm:max-w-36">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CalendarPreview({
  groupName,
  date,
  values,
}: {
  groupName: string;
  date: IsoDate;
  values: TimeAndPlaceValues;
}) {
  const location = values.location.trim();
  return (
    <section
      aria-label="In players' calendars"
      className="rounded-xl border border-dashed border-line-strong p-3"
    >
      <Eyebrow className="mb-2" aria-hidden="true">
        In players' calendars
      </Eyebrow>
      <div className="flex gap-3 rounded-md border border-line bg-surface p-3 shadow-card">
        <span className="w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
        <div className="min-w-0 text-sm">
          <p className="truncate font-semibold">{groupName}</p>
          <p className="text-ink-2">
            {`${dayLabel(date)} · `}
            <span className="font-mono text-[13px]">{timeRange(values)}</span>
          </p>
          <p className={cn("mt-1 truncate", location ? "text-ink-2" : "text-ink-3 italic")}>
            {location || "No place yet"}
          </p>
        </div>
      </div>
    </section>
  );
}
