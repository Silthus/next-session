import { useState } from "react";
import { endClockTime, isClockTime, type ClockTime } from "../../../../shared/sessionTime";
import { cn } from "../../../ui/cn";
import { focusRing, pressable } from "../../../ui/interactive";

const LENGTH_CHOICES_IN_HOURS = [2, 3, 4, 5, 6];

export function StartTimeField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (startTime: string) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="19:00"
      maxLength={5}
      required
      value={typed ?? value}
      onChange={(event) => {
        setTyped(event.target.value);
        const startTime = readClockTime(event.target.value);
        if (startTime) onChange(startTime);
      }}
      onBlur={() => setTyped(null)}
      className={cn(
        "h-11 w-36 rounded-md border border-line-strong bg-surface px-3 font-mono text-base text-ink tabular-nums",
        focusRing,
      )}
    />
  );
}

const TYPED_CLOCK_TIME = /^(\d{1,2})[:.]?(\d{2})$/;

function readClockTime(typed: string): ClockTime | null {
  const [, hours, minutes] = TYPED_CLOCK_TIME.exec(typed.trim()) ?? [];
  if (hours === undefined || minutes === undefined) return null;
  const startTime = `${hours.padStart(2, "0")}:${minutes}`;
  return isClockTime(startTime) ? startTime : null;
}

export function LengthChips({
  labelledBy,
  startTime,
  lengthMinutes,
  onChange,
}: {
  labelledBy: string;
  startTime: string;
  lengthMinutes: number;
  onChange: (lengthMinutes: number) => void;
}) {
  return (
    <div>
      <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-1.5">
        {LENGTH_CHOICES_IN_HOURS.map((hours) => {
          const minutes = hours * 60;
          const chosen = minutes === lengthMinutes;
          return (
            <button
              key={hours}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => onChange(minutes)}
              className={cn(
                "h-9 min-w-12 rounded-md border px-3 text-sm font-semibold",
                pressable,
                chosen
                  ? "border-accent bg-accent-soft text-ink"
                  : "border-line-strong text-ink-2 hover:bg-surface-hover",
              )}
            >
              {`${String(hours)} h`}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-ink-3">
        {`Until about ${endClockTime(startTime as ClockTime, lengthMinutes)}`}
      </p>
    </div>
  );
}
