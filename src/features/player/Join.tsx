import { Link } from "@tanstack/react-router";
import { useId, useState, type FormEvent } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AppErrorData } from "../../../convex/model/errors";
import { appErrorMessage, appErrorOf } from "../../lib/errors";
import { pageTitle } from "../../lib/pageTitle";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Eyebrow } from "../../ui/Eyebrow";
import { PageShell } from "../../ui/PageShell";
import { useFocusOnMount } from "../../ui/useFocusOnMount";

export type RosterPlayer = { _id: Id<"players">; name: string };

const CHIPS_WITHOUT_FILTER = 12;

export function Join({
  groupName,
  players,
  removed = false,
  onPick,
  onJoin,
}: {
  groupName: string;
  players: RosterPlayer[];
  removed?: boolean;
  onPick: (player: RosterPlayer) => void;
  onJoin: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [joining, setJoining] = useState(false);
  const [refusal, setRefusal] = useState<AppErrorData | null | undefined>(undefined);
  const refusalId = useId();
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const takenPlayerId = refusal?.code === "NAME_TAKEN" ? refusal.playerId : null;
  const fieldLabel = players.length > 0 ? "Not listed? Your name" : "Your name";
  const filterable = players.length > CHIPS_WITHOUT_FILTER;
  const activeFilter = filterable ? filter : "";
  const shownPlayers = alphabetical(players).filter(
    (player) => player._id === takenPlayerId || nameMatches(player.name, activeFilter),
  );

  async function join(event: FormEvent) {
    event.preventDefault();
    setJoining(true);
    setRefusal(undefined);
    try {
      await onJoin(name);
    } catch (error) {
      setRefusal(appErrorOf(error));
    } finally {
      setJoining(false);
    }
  }

  return (
    <PageShell
      maxWidth="md"
      centerFooter
      className={cn("flex flex-col gap-6", !filterable && "justify-center")}
    >
      <title>{pageTitle(groupName)}</title>
      <div className="animate-rise">
        <Eyebrow>You're invited to</Eyebrow>
        <h1
          ref={heading}
          tabIndex={-1}
          className="mt-1 font-display text-4xl font-extrabold break-words outline-none"
        >
          {groupName}
        </h1>
        <p className="mt-2 text-ink-2">Tap the nights you can play. No account, takes a minute.</p>
      </div>
      <section className="animate-rise rounded-xl border border-line bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-bold">Who are you?</h2>
        {removed && (
          <p className="mt-1 text-sm text-ink-2">
            Your name is no longer on the list. Pick or add one.
          </p>
        )}
        {filterable && (
          <NameFilter value={filter} noMatch={shownPlayers.length === 0} onChange={setFilter} />
        )}
        {shownPlayers.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {shownPlayers.map((player) => (
              <li key={player._id}>
                <PlayerChip
                  player={player}
                  highlighted={player._id === takenPlayerId}
                  disabled={joining}
                  describedBy={player._id === takenPlayerId ? refusalId : undefined}
                  onPick={onPick}
                />
              </li>
            ))}
          </ul>
        )}
        <form className="mt-4 flex gap-2" onSubmit={(event) => void join(event)}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label={fieldLabel}
            placeholder={fieldLabel}
            autoComplete="given-name"
            enterKeyHint="go"
            className="h-14 min-w-0 flex-1 rounded-md border border-line bg-paper px-3.5 text-base outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
          />
          <Button
            size="lg"
            type="submit"
            disabled={name.trim() === ""}
            busy={joining && "Joining…"}
          >
            Join
          </Button>
        </form>
        {refusal !== undefined && (
          <p id={refusalId} role="alert" className="mt-3 text-sm font-medium text-busy">
            {appErrorMessage(refusal, "join")}
          </p>
        )}
      </section>
      <p className="text-center text-xs text-ink-3">
        Planning your own game?{" "}
        <Link
          to="/"
          className="-my-3.5 inline-block py-3.5 font-semibold text-accent hover:underline"
        >
          Create your link
        </Link>
      </p>
    </PageShell>
  );
}

function NameFilter({
  value,
  noMatch,
  onChange,
}: {
  value: string;
  noMatch: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Find your name"
        placeholder="Find your name"
        autoComplete="off"
        enterKeyHint="done"
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur();
        }}
        className="mt-3 h-12 w-full rounded-md border border-line bg-paper px-3.5 text-base outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
      />
      <p role="status" aria-live="polite" className="mt-3 text-sm text-ink-2 empty:mt-0">
        {noMatch ? "No names match. Add yours below." : ""}
      </p>
    </>
  );
}

function PlayerChip({
  player,
  highlighted,
  disabled,
  describedBy,
  onPick,
}: {
  player: RosterPlayer;
  highlighted: boolean;
  disabled: boolean;
  describedBy: string | undefined;
  onPick: (player: RosterPlayer) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(player)}
      disabled={disabled}
      aria-describedby={describedBy}
      className={cn(
        "flex min-h-11 max-w-full items-center gap-2 rounded-full border py-1.5 pr-3.5 pl-1.5 text-sm font-semibold transition-[background-color,border-color,transform] duration-150 hover:border-accent hover:bg-accent-soft active:scale-95 disabled:pointer-events-none disabled:opacity-60",
        highlighted
          ? "animate-pop border-accent bg-accent-soft ring-2 ring-accent"
          : "border-line bg-paper",
      )}
    >
      <Avatar name={player.name} size="sm" />
      <span className="min-w-0 wrap-anywhere">{player.name}</span>
    </button>
  );
}

function nameMatches(name: string, filter: string) {
  return searchable(name).includes(searchable(filter.trim()));
}

const LETTERS_WITHOUT_DECOMPOSITION: Record<string, string> = {
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ı: "i",
};

function searchable(text: string) {
  const unaccented = text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
  return Array.from(unaccented, (letter) => LETTERS_WITHOUT_DECOMPOSITION[letter] ?? letter).join(
    "",
  );
}

function alphabetical(players: RosterPlayer[]) {
  return [...players].sort((a, b) => a.name.localeCompare(b.name));
}
