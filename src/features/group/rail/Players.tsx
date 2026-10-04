import { useEffect, useId, useRef, useState } from "react";
import type { PlayerProgress, PlayerRow } from "../../../../shared/monthSummary";
import { Avatar } from "../../../ui/Avatar";
import { Button } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { IconCheck, IconMore } from "../../../ui/icons";
import { errorMessage } from "../../../lib/errors";
import { NameForm } from "./NameForm";
import { MenuButton, Popover } from "./Popover";
import { EmptyLine, RailCard } from "./RailCard";

type PlayersProps = {
  progress: readonly PlayerProgress<PlayerRow>[];
  onAdd: (name: string) => Promise<unknown>;
  onRename: (playerId: string, name: string) => Promise<unknown>;
  onRemove: (playerId: string) => Promise<unknown>;
};

export function Players({ progress, onAdd, onRename, onRemove }: PlayersProps) {
  const [adding, setAdding] = useState(progress.length === 0);
  const addButton = useRef<HTMLButtonElement>(null);
  const closeForm = () => {
    setAdding(false);
    addButton.current?.focus();
  };
  return (
    <RailCard
      title={`Players · ${String(progress.length)}`}
      action={
        <button
          ref={addButton}
          type="button"
          aria-label="Add player"
          onClick={() => setAdding(true)}
          className="rounded-sm text-xs font-semibold text-accent-strong hover:underline"
        >
          + Add
        </button>
      }
    >
      {progress.length === 0 && (
        <EmptyLine>
          Players add themselves when they open your link. You can also add names now.
        </EmptyLine>
      )}
      {progress.length > 0 && (
        <ul className="mt-3 flex max-h-[26.5rem] flex-col gap-0.5 overflow-y-auto">
          {progress.map((entry) => (
            <PlayerItem
              key={entry.player._id}
              entry={entry}
              onRename={(name) => onRename(entry.player._id, name)}
              onRemove={() => onRemove(entry.player._id)}
            />
          ))}
        </ul>
      )}
      {adding && (
        <NameForm
          label="Player name"
          placeholder="Player name"
          submitLabel="Add"
          topic="roster"
          className="mt-3"
          onSubmit={async (name) => {
            await onAdd(name);
            closeForm();
          }}
          onCancel={closeForm}
        />
      )}
    </RailCard>
  );
}

type Mode = "view" | "renaming" | "confirmingRemove";

function PlayerItem({
  entry: { player, answered, fillable },
  onRename,
  onRemove,
}: {
  entry: PlayerProgress<PlayerRow>;
  onRename: (name: string) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const more = useRef<HTMLButtonElement>(null);
  const refocusMore = useRef(false);
  const backToView = () => {
    refocusMore.current = true;
    setMode("view");
  };

  useEffect(() => {
    if (mode !== "view" || !refocusMore.current) return;
    refocusMore.current = false;
    more.current?.focus();
  }, [mode]);

  if (mode === "renaming") {
    return (
      <li className="py-1">
        <NameForm
          label={`New name for ${player.name}`}
          initialName={player.name}
          submitLabel="Save"
          topic="roster"
          onSubmit={async (name) => {
            await onRename(name);
            backToView();
          }}
          onCancel={backToView}
        />
      </li>
    );
  }
  if (mode === "confirmingRemove") {
    return (
      <li className="py-1">
        <RemoveConfirm name={player.name} onRemove={onRemove} onKeep={backToView} />
      </li>
    );
  }
  return (
    <li className="group flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-surface-2">
      <Avatar name={player.name} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{player.name}</span>
      <AnswerProgress answered={answered} fillable={fillable} />
      <Popover
        triggerRef={more}
        align="end"
        className="w-36"
        trigger={(props) => (
          <button
            {...props}
            type="button"
            aria-label={`More for ${player.name}`}
            className="rounded-sm p-1 text-ink-3 transition-opacity hover:text-ink focus-visible:opacity-100 aria-expanded:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
          >
            <IconMore />
          </button>
        )}
      >
        <MenuButton onSelect={() => setMode("renaming")}>Rename</MenuButton>
        <MenuButton
          onSelect={() => setMode("confirmingRemove")}
          className="text-busy hover:bg-busy-soft"
        >
          Remove
        </MenuButton>
      </Popover>
    </li>
  );
}

function AnswerProgress({ answered, fillable }: { answered: number; fillable: number }) {
  if (fillable > 0 && answered === fillable) {
    return (
      <span role="img" aria-label="Answered every night" className="text-free">
        <IconCheck className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "font-mono text-[11px] tabular-nums",
        answered === 0 ? "text-ink-3" : "text-ink-2",
      )}
    >
      {`${String(answered)}/${String(fillable)}`}
    </span>
  );
}

function RemoveConfirm({
  name,
  onRemove,
  onKeep,
}: {
  name: string;
  onRemove: () => Promise<unknown>;
  onKeep: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const questionId = useId();
  const remove = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onRemove();
    } catch (error) {
      setFailure(errorMessage(error, "roster"));
      setBusy(false);
    }
  };
  return (
    <div
      role="group"
      aria-labelledby={questionId}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onKeep();
      }}
      className="rounded-md bg-busy-soft p-2.5 text-xs text-ink"
    >
      <p id={questionId} className="font-medium">{`Remove ${name}? Their answers go too.`}</p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="danger" busy={busy && "Removing…"} onClick={() => void remove()}>
          {`Remove ${name}`}
        </Button>
        <Button size="sm" variant="ghost" onClick={onKeep} disabled={busy} autoFocus>
          Keep
        </Button>
      </div>
      {failure && (
        <p role="alert" className="mt-2 font-medium text-busy">
          {failure}
        </p>
      )}
    </div>
  );
}
