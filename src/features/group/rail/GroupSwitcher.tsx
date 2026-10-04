import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { Button } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { IconChevron } from "../../../ui/icons";
import { Skeleton } from "../../../ui/Skeleton";
import { errorMessage } from "../../../lib/errors";
import { NameForm } from "./NameForm";
import { MenuButton, menuItemClassName, Popover, useClosePopover } from "./Popover";

export type SwitcherGroup = { id: string; name: string; playerCount: number };

type GroupSwitcherProps = {
  group: { id: string; name: string };
  groups: readonly SwitcherGroup[] | undefined;
  onOpen: (groupId: string) => void;
  onCreate: () => Promise<unknown>;
  onRename: (name: string) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
};

export function GroupSwitcher({ group, onRename, onCreate, ...menu }: GroupSwitcherProps) {
  const [renaming, setRenaming] = useState(false);
  const [creating, setCreating] = useState(false);
  const createStarted = useRef(false);
  const create = async () => {
    if (createStarted.current) return;
    createStarted.current = true;
    setCreating(true);
    try {
      await onCreate();
    } finally {
      createStarted.current = false;
      setCreating(false);
    }
  };
  const trigger = useRef<HTMLButtonElement>(null);
  const refocusTrigger = useRef(false);
  const stopRenaming = () => {
    refocusTrigger.current = true;
    setRenaming(false);
  };

  useEffect(() => {
    if (renaming || !refocusTrigger.current) return;
    refocusTrigger.current = false;
    trigger.current?.focus();
  }, [renaming]);

  if (renaming) {
    return (
      <NameForm
        label="Group name"
        initialName={group.name}
        submitLabel="Save"
        topic="group"
        className="min-w-0 flex-1"
        inputClassName="font-display text-base font-bold sm:text-lg"
        onSubmit={async (name) => {
          await onRename(name);
          stopRenaming();
        }}
        onCancel={stopRenaming}
      />
    );
  }

  return (
    <Popover
      triggerRef={trigger}
      className="w-72 max-w-[calc(100vw-2rem)]"
      trigger={(props) => (
        <h1 className="min-w-0">
          <button
            {...props}
            type="button"
            className="flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 font-display text-lg font-bold hover:bg-surface-2 sm:text-xl"
          >
            <span className="truncate">{group.name}</span>
            <IconChevron direction="down" className="shrink-0 text-ink-3" />
          </button>
        </h1>
      )}
    >
      <SwitcherMenu
        group={group}
        {...menu}
        creating={creating}
        onCreate={create}
        onStartRename={() => setRenaming(true)}
      />
    </Popover>
  );
}

function SwitcherMenu({
  group,
  groups,
  onOpen,
  onCreate,
  onDelete,
  creating,
  onStartRename,
}: Omit<GroupSwitcherProps, "onRename"> & { creating: boolean; onStartRename: () => void }) {
  const close = useClosePopover();
  const [busy, setBusy] = useState<"creating" | "deleting" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const refocusDelete = useRef(false);
  const keepGroup = () => {
    refocusDelete.current = true;
    setConfirmingDelete(false);
  };

  useEffect(() => {
    if (confirmingDelete || !refocusDelete.current) return;
    refocusDelete.current = false;
    deleteButton.current?.focus();
  }, [confirmingDelete]);
  const playerCount = groups?.find((candidate) => candidate.id === group.id)?.playerCount ?? 0;

  const run = async (kind: "creating" | "deleting", action: () => Promise<unknown>) => {
    setBusy(kind);
    setFailure(null);
    try {
      await action();
      close({ refocus: false });
    } catch (error) {
      setFailure(errorMessage(error, "group"));
      setBusy(null);
    }
  };

  const open = (event: MouseEvent, groupId: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    close({ refocus: false });
    onOpen(groupId);
  };

  return (
    <>
      <p className="px-2 pt-1 pb-1 font-mono text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">
        Your groups
      </p>
      {groups === undefined ? (
        <Skeleton className="mx-2 my-2 h-6" />
      ) : (
        <ul className="flex max-h-64 flex-col overflow-y-auto">
          {groups.map((candidate) => (
            <li key={candidate.id}>
              <a
                href={`/g/${candidate.id}`}
                aria-current={candidate.id === group.id ? "page" : undefined}
                aria-label={`${candidate.name}, ${playersLabel(candidate.playerCount)}`}
                onClick={(event) => open(event, candidate.id)}
                className={cn(
                  menuItemClassName,
                  candidate.id === group.id && "bg-surface-2 font-semibold",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                <span className="font-mono text-[11px] text-ink-3">{candidate.playerCount}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={busy !== null || creating}
        onClick={() => void run("creating", onCreate)}
        className={cn(menuItemClassName, "mt-1 font-semibold text-accent-strong")}
      >
        {creating ? (
          "Making your group…"
        ) : (
          <>
            <span aria-hidden="true">+</span>New group
          </>
        )}
      </button>
      <div className="my-1.5 border-t border-line" />
      <MenuButton onSelect={onStartRename}>Rename group</MenuButton>
      {confirmingDelete ? (
        <DeleteConfirm
          name={group.name}
          playerCount={playerCount}
          busy={busy === "deleting"}
          onDelete={() => void run("deleting", onDelete)}
          onKeep={keepGroup}
        />
      ) : (
        <button
          ref={deleteButton}
          type="button"
          disabled={groups === undefined}
          onClick={() => setConfirmingDelete(true)}
          className={cn(menuItemClassName, "text-busy hover:bg-busy-soft")}
        >
          Delete group
        </button>
      )}
      {failure && (
        <p role="alert" className="px-2 py-1.5 text-xs font-medium text-busy">
          {failure}
        </p>
      )}
    </>
  );
}

function DeleteConfirm({
  name,
  playerCount,
  busy,
  onDelete,
  onKeep,
}: {
  name: string;
  playerCount: number;
  busy: boolean;
  onDelete: () => void;
  onKeep: () => void;
}) {
  const questionId = useId();
  return (
    <div
      role="group"
      aria-labelledby={questionId}
      className="rounded-md bg-busy-soft p-2.5 text-xs"
    >
      <p id={questionId} className="font-semibold break-words">{`Delete ${name}?`}</p>
      <p className="mt-0.5 text-ink-2">{lossLine(playerCount)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="danger" busy={busy && "Deleting…"} onClick={onDelete}>
          <span className="max-w-40 truncate">{`Delete ${name}`}</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={onKeep} disabled={busy} autoFocus>
          Keep
        </Button>
      </div>
    </div>
  );
}

function lossLine(playerCount: number) {
  const lost =
    playerCount === 0
      ? "Its sessions go too"
      : `Its ${playersLabel(playerCount)}, their answers and its sessions go too`;
  return `${lost}, and the player link stops working.`;
}

function playersLabel(count: number) {
  return count === 1 ? "1 player" : `${String(count)} players`;
}
