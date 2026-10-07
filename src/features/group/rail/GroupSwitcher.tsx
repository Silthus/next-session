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

type Pending = "creating" | "deleting";

type RunAction = (kind: Pending, action: () => Promise<unknown>) => Promise<boolean>;

export function GroupSwitcher({ group, onRename, ...menu }: GroupSwitcherProps) {
  const [renaming, setRenaming] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);
  const run: RunAction = async (kind, action) => {
    if (started.current) return false;
    started.current = true;
    setPending(kind);
    setFailure(null);
    try {
      await action();
      return true;
    } catch (error) {
      setFailure(errorMessage(error, "group"));
      return false;
    } finally {
      started.current = false;
      setPending(null);
    }
  };
  const forgetSeenFailure = () => {
    if (pending === null) setFailure(null);
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
        inputClassName="font-display text-base font-semibold sm:text-lg"
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
      onClosed={forgetSeenFailure}
      trigger={(props) => (
        <h1 className="min-w-0">
          <button
            {...props}
            type="button"
            className="flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 font-display text-lg font-semibold hover:bg-surface-2 sm:text-xl"
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
        pending={pending}
        failure={failure}
        run={run}
        onStartRename={() => {
          forgetSeenFailure();
          setRenaming(true);
        }}
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
  pending,
  failure,
  run,
  onStartRename,
}: Omit<GroupSwitcherProps, "onRename"> & {
  pending: Pending | null;
  failure: string | null;
  run: RunAction;
  onStartRename: () => void;
}) {
  const close = useClosePopover();
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

  const act = async (kind: Pending, action: () => Promise<unknown>) => {
    if (await run(kind, action)) close({ refocus: false });
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
        disabled={pending !== null}
        onClick={() => void act("creating", onCreate)}
        className={cn(menuItemClassName, "mt-1 font-semibold text-accent-strong")}
      >
        {pending === "creating" ? (
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
          busy={pending === "deleting"}
          blocked={pending !== null}
          onDelete={() => void act("deleting", onDelete)}
          onKeep={keepGroup}
        />
      ) : (
        <button
          ref={deleteButton}
          type="button"
          disabled={groups === undefined || pending !== null}
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
  blocked,
  onDelete,
  onKeep,
}: {
  name: string;
  playerCount: number;
  busy: boolean;
  blocked: boolean;
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
        <Button
          size="sm"
          variant="danger"
          busy={busy && "Deleting…"}
          disabled={blocked}
          onClick={onDelete}
        >
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
