// PROTOTYPE for #128, throwaway. A free-text field that suggests addresses as the GM types.
// Suggestions come from a fake Geoapify; "off" is the field without a key or after the provider failed.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../../../../ui/cn";
import { focusRing } from "../../../../ui/interactive";
import { fakeGeoapify, type Suggestion } from "./fixtures";

export type Autocomplete = "live" | "off";

export const locationHint = "An address, a note like “Max's place”, or a link for online games.";

export function AddressField({
  value,
  onChange,
  autocomplete,
  startOpen = false,
  autoFocus = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  autocomplete: Autocomplete;
  startOpen?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(startOpen);
  const [active, setActive] = useState(-1);
  const suggestions = useSuggestions(autocomplete === "live" ? value : "");
  const showList = open && autocomplete === "live" && value.trim().length >= 3;
  const options = showList ? suggestions : [];
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!startOpen) return;
    const timer = setTimeout(() => input.current?.scrollIntoView({ block: "center" }), 400);
    return () => clearTimeout(timer);
  }, [startOpen]);

  const pick = (suggestion: Suggestion) => {
    onChange(`${suggestion.line1}, ${suggestion.line2}`);
    setOpen(false);
    setActive(-1);
  };
  const keep = () => {
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = options[active];
      if (chosen) pick(chosen);
      else keep();
    } else if (event.key === "Escape") {
      keep();
    }
  };

  return (
    <div className={cn("relative", className)}>
      <input
        ref={input}
        id={id}
        type="text"
        role={autocomplete === "live" ? "combobox" : undefined}
        aria-expanded={autocomplete === "live" ? showList : undefined}
        aria-controls={autocomplete === "live" ? listId : undefined}
        aria-autocomplete={autocomplete === "live" ? "list" : undefined}
        aria-activedescendant={active >= 0 ? `${listId}-${String(active)}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        placeholder="Where you play"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (!startOpen) setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3",
          focusRing,
        )}
      />
      {showList && (
        <div
          className="animate-rise absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-card"
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            type="button"
            onClick={keep}
            className="flex w-full items-baseline gap-2 border-b border-line px-3 py-2.5 text-left text-sm hover:bg-surface-hover"
          >
            <span className="text-ink-3">Keep</span>
            <span className="min-w-0 truncate font-semibold">{`“${value.trim()}”`}</span>
          </button>
          <ul id={listId} role="listbox" aria-label="Addresses" className="py-1">
            {options.map((suggestion, index) => (
              <li
                key={`${suggestion.line1}-${suggestion.line2}`}
                id={`${listId}-${String(index)}`}
                role="option"
                aria-selected={index === active}
                onClick={() => pick(suggestion)}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 px-3 py-2",
                  index === active && "bg-surface-hover",
                )}
              >
                <PinIcon />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    <Highlight text={suggestion.line1} query={value} />
                  </span>
                  <span className="block truncate text-xs text-ink-3">{suggestion.line2}</span>
                </span>
              </li>
            ))}
          </ul>
          {options.length === 0 && (
            <p className="px-3 pb-2 text-xs text-ink-3">
              No address matches. That's fine, players see what you typed.
            </p>
          )}
          <p className="border-t border-line bg-surface-2 px-3 py-1.5 text-[11px] text-ink-3">
            Powered by <span className="underline underline-offset-2">Geoapify</span> ·{" "}
            <span className="underline underline-offset-2">© OpenStreetMap</span> contributors
          </p>
        </div>
      )}
    </div>
  );
}

function useSuggestions(query: string) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(() => fakeGeoapify(query));
  useEffect(() => {
    if (query.trim().length < 3) return;
    const timer = setTimeout(() => setSuggestions(fakeGeoapify(query)), 250);
    return () => clearTimeout(timer);
  }, [query]);
  return suggestions;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const word = query.trim().split(/\s+/)[0] ?? "";
  const at = word ? text.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-accent-soft text-ink">{text.slice(at, at + word.length)}</mark>
      {text.slice(at + word.length)}
    </>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10 2a6 6 0 0 0-6 6c0 4.2 5.1 9.4 5.4 9.7a.8.8 0 0 0 1.2 0C10.9 17.4 16 12.2 16 8a6 6 0 0 0-6-6Zm0 8.2A2.2 2.2 0 1 1 10 5.8a2.2 2.2 0 0 1 0 4.4Z"
      />
    </svg>
  );
}
