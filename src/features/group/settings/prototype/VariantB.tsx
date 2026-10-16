// PROTOTYPE for #128, throwaway. Variant B: settings rows that save on change,
// next to a live preview of the calendar entry players get.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Card } from "../../../../ui/Card";
import { cn } from "../../../../ui/cn";
import { Eyebrow } from "../../../../ui/Eyebrow";
import { IconCheck } from "../../../../ui/icons";
import { AddressField, locationHint } from "./AddressField";
import { FieldLabel, LengthChips, SettingsFrame, StartInput, TimeZoneLine } from "./fields";
import { groupName, timeLine, zoneLabel, type UsualNight } from "./fixtures";
import type { StateSetup } from "./states";

export const variantBName = "Live calendar preview";

type Field = keyof UsualNight;

export function VariantB({ setup }: { setup: StateSetup }) {
  const [night, setNight] = useState(setup.night);
  const [savedField, setSavedField] = useState<Field | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const change = <K extends Field>(field: K, value: UsualNight[K]) => {
    setNight((current) => ({ ...current, [field]: value }));
    clearTimeout(timer.current);
    setSavedField(null);
    timer.current = setTimeout(() => setSavedField(field), 700);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <SettingsFrame width="max-w-4xl">
      <div>
        <Eyebrow>Group settings</Eyebrow>
        <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">When and where you play</h1>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <div className="lg:order-2 lg:sticky lg:top-20">
          <CalendarPreview night={night} />
        </div>
        <Card className="divide-y divide-line p-0 lg:order-1">
          <Row label="Starts at" saved={savedField === "start"} hint={night.start ? undefined : "Empty means all day."}>
            <StartInput value={night.start} onChange={(start) => change("start", start)} className="w-36" />
            <div className="mt-2">
              <TimeZoneLine value={night.timeZone} onChange={(zone) => change("timeZone", zone)} />
            </div>
          </Row>
          <Row label="Plays for" saved={savedField === "hours"}>
            <LengthChips hours={night.hours} start={night.start} onChange={(hours) => change("hours", hours)} />
          </Row>
          <Row label="Where" saved={savedField === "location"} hint={locationHint}>
            <AddressField
              value={night.location}
              onChange={(location) => change("location", location)}
              autocomplete={setup.autocomplete}
              startOpen={setup.locationOpen}
              autoFocus={setup.locationOpen}
            />
          </Row>
        </Card>
      </div>
      <p className="text-xs text-ink-3">
        Changes save as you go and move your upcoming Sessions in players' calendars.
      </p>
    </SettingsFrame>
  );
}

function Row({
  label,
  hint,
  saved,
  children,
}: {
  label: string;
  hint?: string;
  saved: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 p-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4 sm:p-5">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {label}
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium text-ink-2 transition-opacity dark:text-free",
              saved ? "opacity-100" : "opacity-0",
            )}
            aria-live="polite"
          >
            {saved && (
              <>
                <IconCheck className="size-3.5" />
                Saved
              </>
            )}
          </span>
        </p>
        {hint && <p className="mt-0.5 text-xs text-ink-3 sm:max-w-36">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CalendarPreview({ night }: { night: UsualNight }) {
  return (
    <section aria-label="What players see" className="rounded-xl border border-dashed border-line-strong p-3">
      <Eyebrow className="mb-2">In players' calendars</Eyebrow>
      <div className="flex gap-3 rounded-md border border-line bg-surface p-3 shadow-card">
        <span className="w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold">{groupName}</p>
          <p className="text-ink-2">
            Tue, Oct 20 · <span className="font-mono text-[13px]">{timeLine(night)}</span>
          </p>
          {night.start && <p className="text-xs text-ink-3">{zoneLabel(night.timeZone)}</p>}
          <p className={cn("mt-1 truncate", night.location ? "text-ink-2" : "text-ink-3 italic")}>
            {night.location || "No place yet"}
          </p>
          <p className="mt-1 truncate font-mono text-xs text-accent-strong">next-session.link/s/…</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        Players with an account get this as an invite. It moves when you change it here.
      </p>
    </section>
  );
}
