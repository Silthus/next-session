import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { LOCATION_MAX_LENGTH } from "../../../../shared/limits";
import { isImeComposing } from "../../../lib/keyboard";
import { cn } from "../../../ui/cn";
import { focusRing } from "../../../ui/interactive";
import { useAddressSuggestions, type Address, type AddressSuggestions } from "./addressSuggestions";

export const locationHint = "An address, a note like “Max’s place”, or a link for online games.";

const lettersBeforeAsking = 3;
const pauseBeforeAskingMs = 300;
const noRowChosen = -1;
const keepRow = 0;

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
  const lookup = useAddressLookup();
  const listId = useId();
  const rowId = (row: number) => `${listId}-${String(row)}`;
  const open = lookup.addresses !== null;
  const rowCount = 1 + (lookup.addresses?.length ?? 0);

  const pick = (address: Address) => {
    onChange(addressText(address));
    lookup.close();
  };
  const choose = (row: number) => {
    const address = lookup.addresses?.[row - 1];
    if (address) pick(address);
    else lookup.close();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || isImeComposing(event.nativeEvent)) return;
    const moves: Record<string, () => void> = {
      ArrowDown: () => lookup.highlight(Math.min(lookup.highlighted + 1, rowCount - 1)),
      ArrowUp: () => lookup.highlight(Math.max(lookup.highlighted - 1, noRowChosen)),
      Enter: () => choose(lookup.highlighted),
      Escape: () => lookup.close(),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    event.stopPropagation();
    move();
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        maxLength={LOCATION_MAX_LENGTH}
        placeholder="Where you play"
        autoComplete="off"
        aria-describedby={describedBy}
        {...(lookup.live && {
          role: "combobox",
          "aria-autocomplete": "list" as const,
          "aria-expanded": open,
          "aria-controls": listId,
          "aria-activedescendant":
            open && lookup.highlighted !== noRowChosen ? rowId(lookup.highlighted) : undefined,
        })}
        onChange={(event) => {
          onChange(event.target.value);
          lookup.ask(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={lookup.close}
        className={cn(
          "h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3",
          focusRing,
        )}
      />
      {lookup.addresses && (
        <div
          className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-card"
          onMouseDown={(event) => event.preventDefault()}
        >
          <ul id={listId} role="listbox" aria-label="Addresses" className="py-1">
            <Row
              id={rowId(keepRow)}
              highlighted={lookup.highlighted === keepRow}
              onChoose={lookup.close}
            >
              <span className="text-ink-3">Keep</span>{" "}
              <span className="font-semibold">{`“${value.trim()}”`}</span>
            </Row>
            {lookup.addresses.map((address, index) => (
              <Row
                key={`${String(index)}-${addressText(address)}`}
                id={rowId(index + 1)}
                highlighted={lookup.highlighted === index + 1}
                onChoose={() => pick(address)}
              >
                <span className="block truncate text-sm font-semibold">{address.street}</span>
                <span className="block truncate text-xs text-ink-3">{address.town}</span>
              </Row>
            ))}
          </ul>
          {lookup.addresses.length === 0 && (
            <p className="px-3 pb-2 text-xs text-ink-3">
              No address matches. That’s fine, players see what you typed.
            </p>
          )}
          <GeoapifyCredit />
        </div>
      )}
    </div>
  );
}

function Row({
  id,
  highlighted,
  onChoose,
  children,
}: {
  id: string;
  highlighted: boolean;
  onChoose: () => void;
  children: ReactNode;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={highlighted}
      onClick={onChoose}
      className={cn(
        "cursor-pointer truncate px-3 py-2 text-sm hover:bg-surface-hover",
        highlighted && "bg-surface-hover",
      )}
    >
      {children}
    </li>
  );
}

function GeoapifyCredit() {
  const link = "underline underline-offset-2 hover:text-ink-2";
  return (
    <p className="border-t border-line bg-surface-2 px-3 py-1.5 text-[11px] text-ink-3">
      Powered by{" "}
      <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className={link}>
        Geoapify
      </a>{" "}
      ·{" "}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className={link}
      >
        © OpenStreetMap contributors
      </a>
    </p>
  );
}

function addressText({ street, town }: Address) {
  return [street, town].filter(Boolean).join(", ").slice(0, LOCATION_MAX_LENGTH);
}

function useAddressLookup() {
  const suggestions = useAddressSuggestions();
  const [failed, setFailed] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [highlighted, setHighlighted] = useState(noRowChosen);
  const live = suggestions !== null && !failed && !suggestions.isStopped();

  useEffect(() => {
    if (!live || typed === null) return;
    return askAfterPause(suggestions, typed, {
      onAnswer: setAddresses,
      onFailure: () => {
        setFailed(true);
        setAddresses(null);
      },
    });
  }, [live, suggestions, typed]);

  const close = () => {
    setTyped(null);
    setAddresses(null);
    setHighlighted(noRowChosen);
  };
  const ask = (text: string) => {
    if (!live) return;
    const query = text.trim();
    if (query.length < lettersBeforeAsking) return close();
    setTyped(query);
    setHighlighted(noRowChosen);
  };

  return {
    live,
    addresses: live ? addresses : null,
    highlighted,
    highlight: setHighlighted,
    ask,
    close,
  };
}

function askAfterPause(
  suggestions: AddressSuggestions,
  query: string,
  { onAnswer, onFailure }: { onAnswer: (addresses: Address[]) => void; onFailure: () => void },
) {
  const cancel = new AbortController();
  const timer = setTimeout(() => {
    suggestions.search(query, cancel.signal).then(
      (addresses) => {
        if (!cancel.signal.aborted) onAnswer(addresses);
      },
      () => {
        if (!cancel.signal.aborted) onFailure();
      },
    );
  }, pauseBeforeAskingMs);
  return () => {
    clearTimeout(timer);
    cancel.abort();
  };
}
