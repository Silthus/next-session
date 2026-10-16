import { LOCATION_MAX_LENGTH } from "../../../../shared/limits";
import { cn } from "../../../ui/cn";
import { focusRing } from "../../../ui/interactive";

export const locationHint = "An address, a note like “Max’s place”, or a link for online games.";

export function LocationField({
  id,
  describedBy,
  value,
  onChange,
}: {
  id: string;
  describedBy?: string;
  value: string;
  onChange: (location: string) => void;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      maxLength={LOCATION_MAX_LENGTH}
      placeholder="Where you play"
      autoComplete="off"
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3",
        focusRing,
      )}
    />
  );
}
