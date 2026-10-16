import { useId, useMemo, useState } from "react";
import { isImeComposing } from "../../../lib/keyboard";
import { zoneName } from "../../../lib/timeAndPlace";
import { cn } from "../../../ui/cn";
import { focusRing, hoverRow } from "../../../ui/interactive";
import { useFocusOnClose } from "../../../ui/useFocusOnClose";

const MATCHES_SHOWN = 8;

export function TimeZoneLine({
  value,
  onChange,
}: {
  value: string;
  onChange: (timeZone: string) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const change = useFocusOnClose<HTMLButtonElement>(choosing);
  if (choosing) {
    return (
      <TimeZoneSearch
        current={value}
        onPick={(timeZone) => {
          onChange(timeZone);
          setChoosing(false);
        }}
        onCancel={() => setChoosing(false)}
      />
    );
  }
  return (
    <p className="text-xs text-ink-3">
      {`${zoneName(value)}. Players abroad see it in their own time. `}
      <button
        ref={change}
        type="button"
        aria-label="Change time zone"
        onClick={() => setChoosing(true)}
        className={cn(
          "rounded-sm font-semibold text-accent-strong underline-offset-2 hover:underline",
          focusRing,
        )}
      >
        Change
      </button>
    </p>
  );
}

function TimeZoneSearch({
  current,
  onPick,
  onCancel,
}: {
  current: string;
  onPick: (timeZone: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const zones = useMemo(() => knownTimeZones(current), [current]);
  const matches = zones
    .filter((zone) => matchesQuery(zone, query))
    .sort((a, b) => closeness(a, query) - closeness(b, query))
    .slice(0, MATCHES_SHOWN);
  const listId = useId();
  const pickTopMatch = () => {
    const top = matches[0];
    if (query.trim() !== "" && top) onPick(top);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="search"
        autoFocus
        aria-label="Find a time zone"
        aria-controls={listId}
        placeholder="City or region"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (isImeComposing(event.nativeEvent)) return;
          const answers: Record<string, () => void> = {
            Enter: () => pickTopMatch(),
            Escape: onCancel,
          };
          const answer = answers[event.key];
          if (!answer) return;
          event.preventDefault();
          event.stopPropagation();
          answer();
        }}
        className={cn(
          "h-9 w-full max-w-72 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink",
          focusRing,
        )}
      />
      <ul id={listId} role="listbox" aria-label="Time zones" className="flex max-w-72 flex-col">
        {matches.map((zone) => (
          <li key={zone} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={zone === current}
              onClick={() => onPick(zone)}
              className={cn("w-full rounded-md px-2 py-1.5 text-left text-sm", hoverRow)}
            >
              {`${zoneName(zone)} `}
              <span className="text-ink-3">{`· ${zone}`}</span>
            </button>
          </li>
        ))}
        {matches.length === 0 && (
          <li className="px-2 py-1.5 text-sm text-ink-3">No zone matches</li>
        )}
      </ul>
    </div>
  );
}

function knownTimeZones(current: string): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes(current) ? zones : [current, ...zones];
}

function matchesQuery(zone: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const searchable = zone.toLowerCase().replaceAll("_", " ");
  return words.every((word) => searchable.includes(word));
}

function closeness(zone: string, query: string): number {
  const city = zoneName(zone).toLowerCase();
  return city.startsWith(query.trim().toLowerCase()) ? city.length : Number.MAX_SAFE_INTEGER;
}
