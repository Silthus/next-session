// PROTOTYPE for #128, throwaway. Field pieces and the page header the variants share.
import { useState, type ReactNode } from "react";
import { cn } from "../../../../ui/cn";
import { IconChevron } from "../../../../ui/icons";
import { focusRing, hoverRow, pressable } from "../../../../ui/interactive";
import { LegalFooter } from "../../../../ui/LegalFooter";
import { Logo } from "../../../../ui/Logo";
import { endTime, groupName, zoneLabel } from "./fixtures";

export const lengths = [2, 3, 4, 5, 6];

const zones = [
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Vienna",
  "Europe/Zurich",
  "America/New_York",
  "America/Los_Angeles",
];

export function StartInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <input
      type="time"
      step={900}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Starts at"
      className={cn(
        "h-11 rounded-md border border-line-strong bg-surface px-3 font-mono text-base text-ink tabular-nums",
        focusRing,
        className,
      )}
    />
  );
}

export function LengthChips({
  hours,
  start,
  onChange,
}: {
  hours: number;
  start: string;
  onChange: (hours: number) => void;
}) {
  return (
    <div>
      <div role="radiogroup" aria-label="Plays for" className="flex flex-wrap gap-1.5">
        {lengths.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === hours}
            onClick={() => onChange(option)}
            className={cn(
              "h-9 min-w-12 rounded-md border px-3 text-sm font-semibold",
              pressable,
              option === hours
                ? "border-accent bg-accent-soft text-ink"
                : "border-line-strong text-ink-2 hover:bg-surface-hover",
            )}
          >
            {`${String(option)} h`}
          </button>
        ))}
      </div>
      {start && (
        <p className="mt-1.5 text-xs text-ink-3">{`Until about ${endTime(start, hours)}`}</p>
      )}
    </div>
  );
}

export function TimeZoneLine({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [changing, setChanging] = useState(false);
  if (changing) {
    return (
      <select
        autoFocus
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setChanging(false);
        }}
        onBlur={() => setChanging(false)}
        aria-label="Time zone"
        className={cn(
          "h-9 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink",
          focusRing,
        )}
      >
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {`${zoneLabel(zone)} · ${zone}`}
          </option>
        ))}
      </select>
    );
  }
  return (
    <p className="text-xs text-ink-3">
      {`${zoneLabel(value)}. Players abroad see it in their own time. `}
      <button
        type="button"
        onClick={() => setChanging(true)}
        className={cn("rounded-sm font-semibold text-accent-strong underline-offset-2 hover:underline", focusRing)}
      >
        Change
      </button>
    </p>
  );
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5">
      <p className="text-sm font-semibold text-ink">{children}</p>
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function SettingsFrame({
  children,
  width = "max-w-xl",
}: {
  children: ReactNode;
  width?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Logo />
          <span className="text-ink-3" aria-hidden="true">
            /
          </span>
          <a
            href="#calendar"
            className={cn(
              "flex min-w-0 items-center gap-1 rounded-md px-2 py-1 font-display text-lg font-semibold sm:text-xl",
              hoverRow,
            )}
          >
            <IconChevron direction="left" className="size-4 shrink-0 text-ink-3" />
            <span className="truncate">{groupName}</span>
          </a>
        </div>
      </header>
      <main className={cn("mx-auto flex w-full flex-1 flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8", width)}>
        {children}
      </main>
      <LegalFooter className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6" />
    </div>
  );
}
