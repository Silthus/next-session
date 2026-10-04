import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { PlayerProgress, PlayerRow } from "../../../../shared/monthSummary";
import { Avatar } from "../../../ui/Avatar";
import { Button } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { IconCheck, IconMore } from "../../../ui/icons";
import { errorMessage } from "../../../lib/errors";
import { NameForm } from "./NameForm";
import { EmptyLine, RailCard } from "./RailCard";

type PlayersProps<Player extends PlayerRow> = {
  progress: readonly PlayerProgress<Player>[];
  onAdd: (name: string) => Promise<unknown>;
  onRename: (playerId: Player["_id"], name: string) => Promise<unknown>;
  onRemove: (playerId: Player["_id"]) => Promise<unknown>;
};

type AddForm = "closed" | "open" | "openedByGm";

export function Players<Player extends PlayerRow>({
  progress,
  onAdd,
  onRename,
  onRemove,
}: PlayersProps<Player>) {
  const [addForm, setAddForm] = useState<AddForm>(progress.length === 0 ? "open" : "closed");
  const addButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const refocusAdd = useRef(false);
  const closeForm = () => {
    refocusAdd.current = true;
    setAddForm("closed");
  };

  useEffect(() => {
    if (addForm !== "closed" || !refocusAdd.current) return;
    refocusAdd.current = false;
    addButton.current?.focus();
  }, [addForm]);

  return (
    <RailCard
      title={`Players · ${String(progress.length)}`}
      headingRef={heading}
      action={
        addForm === "closed" && (
          <button
            ref={addButton}
            type="button"
            aria-label="Add player"
            onClick={() => setAddForm("openedByGm")}
            className="rounded-sm text-xs font-semibold text-accent-strong hover:underline"
          >
            + Add
          </button>
        )
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
              onRemove={async () => {
                await onRemove(entry.player._id);
                (addButton.current ?? heading.current)?.focus();
              }}
            />
          ))}
        </ul>
      )}
      {addForm !== "closed" && (
        <NameForm
          label="Player name"
          autoFocus={addForm === "openedByGm"}
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

type Mode = "view" | "actions" | "renaming" | "confirmingRemove";

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
  const actionsId = useId();
  const backToView = () => {
    refocusMore.current = true;
    setMode("view");
  };
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    backToView();
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
  const showingActions = mode === "actions";
  return (
    <li
      onKeyDown={showingActions ? closeOnEscape : undefined}
      className="group flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-surface-2"
    >
      <Avatar name={player.name} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{player.name}</span>
      {showingActions ? (
        <span id={actionsId} className="flex shrink-0 items-center gap-1">
          <button type="button" className={rowActionClassName} onClick={() => setMode("renaming")}>
            Rename
          </button>
          <button
            type="button"
            className={cn(rowActionClassName, "text-busy hover:bg-busy-soft")}
            onClick={() => setMode("confirmingRemove")}
          >
            Remove
          </button>
        </span>
      ) : (
        <AnswerProgress answered={answered} fillable={fillable} />
      )}
      <button
        ref={more}
        type="button"
        aria-label={`More for ${player.name}`}
        aria-expanded={showingActions}
        aria-controls={showingActions ? actionsId : undefined}
        onClick={() => setMode(showingActions ? "view" : "actions")}
        className="rounded-sm p-1 text-ink-3 transition-opacity hover:text-ink focus-visible:opacity-100 aria-expanded:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
      >
        <IconMore />
      </button>
    </li>
  );
}

const rowActionClassName =
  "rounded-sm px-2 py-1 text-xs font-semibold text-ink-2 hover:bg-surface hover:text-ink";

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
        if (!busy) onKeep();
      }}
      className="rounded-md bg-busy-soft p-2.5 text-xs text-ink"
    >
      <p id={questionId} className="font-medium break-words">
        {`Remove ${name}? Their answers go too.`}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="danger"
          busy={busy && "Removing…"}
          onClick={() => void remove()}
          className="max-w-full"
        >
          <span className="truncate">{`Remove ${name}`}</span>
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
