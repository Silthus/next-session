import { Link } from "@tanstack/react-router";
import { useId, useState, type FormEvent } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AppErrorData } from "../../../convex/model/errors";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Eyebrow } from "../../ui/Eyebrow";
import { PageShell } from "../../ui/PageShell";
import { appErrorOf, joinErrorCopy } from "./playerErrors";

export type RosterPlayer = { _id: Id<"players">; name: string };

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
  const [joining, setJoining] = useState(false);
  const [refusal, setRefusal] = useState<AppErrorData | null | undefined>(undefined);
  const refusalId = useId();
  const takenPlayerId = refusal?.code === "NAME_TAKEN" ? refusal.playerId : null;
  const fieldLabel = players.length > 0 ? "Not listed? Type your name" : "Your name";

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
    <PageShell maxWidth="md" centerFooter className="flex flex-col justify-center gap-6">
      <div className="animate-rise">
        <Eyebrow>You're invited to</Eyebrow>
        <h1 className="mt-1 font-display text-4xl font-extrabold break-words">{groupName}</h1>
        <p className="mt-2 text-ink-2">Tap the nights you can play. No account, takes a minute.</p>
      </div>
      <section className="animate-rise rounded-xl border border-line bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-bold">Who are you?</h2>
        {removed && (
          <p className="mt-1 text-sm text-ink-2">
            Your name is no longer on the list. Pick or add one.
          </p>
        )}
        {players.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {alphabetical(players).map((player) => (
              <li key={player._id}>
                <PlayerChip
                  player={player}
                  highlighted={player._id === takenPlayerId}
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
            maxLength={120}
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
            {joinErrorCopy(refusal)}
          </p>
        )}
      </section>
      <p className="text-center text-xs text-ink-3">
        Planning your own game?{" "}
        <Link to="/" className="font-semibold text-accent hover:underline">
          Create your link
        </Link>
      </p>
    </PageShell>
  );
}

function PlayerChip({
  player,
  highlighted,
  describedBy,
  onPick,
}: {
  player: RosterPlayer;
  highlighted: boolean;
  describedBy: string | undefined;
  onPick: (player: RosterPlayer) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(player)}
      aria-describedby={describedBy}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-full border bg-paper py-1.5 pr-3.5 pl-1.5 text-sm font-semibold transition-[background-color,border-color,transform] duration-150 hover:border-accent hover:bg-accent-soft active:scale-95",
        highlighted ? "animate-pop border-accent bg-accent-soft ring-2 ring-accent" : "border-line",
      )}
    >
      <Avatar name={player.name} size="sm" />
      {player.name}
    </button>
  );
}

function alphabetical(players: RosterPlayer[]) {
  return players.toSorted((a, b) => a.name.localeCompare(b.name));
}
