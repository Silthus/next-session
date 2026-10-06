import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { fillRestDates, type Answer } from "../../../shared/answers";
import { monthOf, type IsoDate, type IsoMonth } from "../../../shared/dates";
import { errorMessage } from "../../lib/errors";
import {
  forgetPlayer,
  hasSeenHint,
  markHintSeen,
  recallPlayer,
  rememberPlayer,
  type PlayerIdentity,
} from "../../lib/storage";
import { NotFoundScreen } from "../../ui/NotFoundScreen";
import { Skeleton } from "../../ui/Skeleton";
import { Button } from "../../ui/Button";
import { Toast, type ToastMessage } from "../../ui/Toast";
import { AccountSheet } from "../account/AccountSheet";
import { useGm } from "../account/useGm";
import { HeaderAccount } from "../group/rail/HeaderAccount";
import { Join } from "./Join";
import { PlayerCalendar } from "./PlayerCalendar";
import { visibleMonth } from "./playerMonth";
import { useTodayUtc } from "./useTodayUtc";

type PlayerGroupView = NonNullable<FunctionReturnType<typeof api.player.group>>;
type MonthChange = (month: IsoMonth) => void;
type Account = ReturnType<typeof useGm>;

const TOAST_MS = 4000;
const KEPT = "Kept in My groups";

export function PlayerScreen({
  shareToken,
  requestedMonth,
  onMonthChange,
}: {
  shareToken: string;
  requestedMonth: string | undefined;
  onMonthChange: MonthChange;
}) {
  const account = useGm();
  const group = useQuery(api.player.group, { shareToken });
  const [accountKnown, setAccountKnown] = useState(false);
  if (!accountKnown && account.status !== "loading") setAccountKnown(true);
  if (group === undefined || !accountKnown) return <PlayerLoading />;
  if (group === null) return <NotFoundScreen kind="link" />;
  return (
    <PlayerGroup
      key={group.groupId}
      shareToken={shareToken}
      group={group}
      account={account}
      requestedMonth={requestedMonth}
      onMonthChange={onMonthChange}
    />
  );
}

function PlayerGroup({
  shareToken,
  group,
  account,
  requestedMonth,
  onMonthChange,
}: {
  shareToken: string;
  group: PlayerGroupView;
  account: Account;
  requestedMonth: string | undefined;
  onMonthChange: MonthChange;
}) {
  const [identity, setIdentity] = useState(() => recallPlayer(group.groupId));
  const join = useMutation(api.player.join);
  const release = useMutation(api.player.release);
  const [toast, showToast] = useToast();
  const [sheet, setSheet] = useState<"logIn" | "keep" | null>(null);
  const claimed = group.players.find(({ _id }) => _id === group.claimedPlayerId);
  if (claimed && identity?.playerId !== claimed._id) {
    setIdentity({ playerId: claimed._id, name: claimed.name });
  }
  const player = claimed ?? group.players.find(({ _id }) => _id === identity?.playerId);
  const removed = identity !== null && player === undefined;
  const keeper = useKeeper(account, shareToken, player?._id);

  useEffect(() => {
    if (removed) forgetPlayer(group.groupId);
  }, [removed, group.groupId]);

  useEffect(() => {
    if (claimed) rememberPlayer(group.groupId, { playerId: claimed._id, name: claimed.name });
  }, [claimed, group.groupId]);

  function answerAs(next: PlayerIdentity | null) {
    if (next) rememberPlayer(group.groupId, next);
    else forgetPlayer(group.groupId);
    setIdentity(next);
  }

  async function notYou() {
    if (claimed) await release({ groupId: group.groupId });
    answerAs(null);
  }

  const accountControl = (
    <AccountControl
      status={account.status}
      email={account.email}
      onLogIn={() => setSheet("logIn")}
      onLogOut={() => void account.signOut()}
    />
  );

  return (
    <>
      {player === undefined ? (
        <Join
          groupName={group.name}
          players={group.players}
          removed={removed}
          accountControl={accountControl}
          onPick={({ _id, name }) => answerAs({ playerId: _id, name })}
          onJoin={async (name) => {
            const playerId = await join({ shareToken, name });
            answerAs({ playerId, name: name.trim() });
            if (account.status === "account") showToast(KEPT);
          }}
        />
      ) : (
        <PlayerAnswers
          shareToken={shareToken}
          group={group}
          player={{ playerId: player._id, name: player.name }}
          requestedMonth={requestedMonth}
          onMonthChange={onMonthChange}
          onNotYou={() =>
            void notYou().catch((error: unknown) => showToast(errorMessage(error, "keep")))
          }
          showToast={showToast}
          keep={player._id === group.claimedPlayerId ? "kept" : keeper.state}
          keepRefusal={keeper.refusal}
          onKeep={() => {
            if (account.status === "account") void keeper.keep(noSignIn);
            else setSheet("keep");
          }}
          accountControl={accountControl}
        />
      )}
      <Toast message={toast} />
      {sheet === "keep" && player ? (
        <AccountSheet
          open
          intent="keep"
          groupName={group.name}
          playerName={player.name}
          movesGroups={account.status === "anonymous"}
          onSubmit={(input) =>
            keeper.keep(() =>
              account.status === "anonymous"
                ? account.save(input)
                : account.signInWithPassword(input),
            )
          }
          onClose={() => setSheet(null)}
        />
      ) : (
        <AccountSheet
          open={sheet === "logIn"}
          intent="logIn"
          forPlayer
          onSubmit={account.logIn}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

function useKeeper(account: Account, shareToken: string, playerId: Id<"players"> | undefined) {
  const [state, setState] = useState<"offer" | "keeping">("offer");
  const [refusal, setRefusal] = useState<string | null>(null);

  async function keep(signInFirst: () => Promise<unknown>) {
    if (playerId === undefined) return;
    setState("keeping");
    setRefusal(null);
    try {
      const outcome = await account.keepGroup({ shareToken, playerId }, signInFirst);
      if (!outcome.kept) setRefusal(errorMessage(outcome.error, "keep"));
    } finally {
      setState("offer");
    }
  }

  return { state, refusal, keep };
}

function AccountControl({
  status,
  email,
  onLogIn,
  onLogOut,
}: {
  status: Account["status"];
  email: string | undefined;
  onLogIn: () => void;
  onLogOut: () => void;
}) {
  if (status === "signedOut") {
    return (
      <Button variant="ghost" size="sm" onClick={onLogIn}>
        Log in
      </Button>
    );
  }
  if (status !== "account") return null;
  return <HeaderAccount status="account" email={email} onSave={noAction} onLogOut={onLogOut} />;
}

function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const show = useCallback((message: string) => {
    setToast((current) => ({ text: message, id: (current?.id ?? 0) + 1 }));
  }, []);

  return [toast, show] as const;
}

function noSignIn() {
  return Promise.resolve();
}

function noAction() {}

function PlayerAnswers({
  shareToken,
  group,
  player,
  requestedMonth,
  onMonthChange,
  onNotYou,
  showToast,
  ...keepLine
}: {
  shareToken: string;
  group: PlayerGroupView;
  player: PlayerIdentity;
  requestedMonth: string | undefined;
  onMonthChange: MonthChange;
  onNotYou: () => void;
  showToast: (message: string) => void;
} & Pick<
  ComponentProps<typeof PlayerCalendar>,
  "keep" | "keepRefusal" | "onKeep" | "accountControl"
>) {
  const today = useTodayUtc();
  const month = visibleMonth(requestedMonth, today);
  const { playerId } = player;
  const answers = useQuery(api.player.answers, { shareToken, playerId, month });
  const saveAnswer = useMutation(api.player.answer).withOptimisticUpdate((store, args) => {
    const query = { shareToken, playerId, month: monthOf(args.date) };
    const current = store.getQuery(api.player.answers, query);
    if (current)
      store.setQuery(api.player.answers, query, withAnswer(current, args.date, args.answer));
  });
  const fillRest = useMutation(api.player.fillRest).withOptimisticUpdate((store, args) => {
    const query = { shareToken, playerId, month: args.month };
    const current = store.getQuery(api.player.answers, query);
    if (current)
      store.setQuery(api.player.answers, query, withRestBusy(current, args.month, today));
  });
  const [hintVisible, setHintVisible] = useState(() => !hasSeenHint(group.groupId));

  function dismissHint() {
    markHintSeen(group.groupId);
    setHintVisible(false);
  }

  if (answers === null) return <NotFoundScreen kind="link" />;

  return (
    <PlayerCalendar
      groupName={group.name}
      playerName={player.name}
      month={month}
      today={today}
      answers={answers}
      sessionDates={group.sessionDates}
      hintVisible={hintVisible}
      onHintToggle={() => (hintVisible ? dismissHint() : setHintVisible(true))}
      onAnswer={(date, answer) => {
        if (hintVisible) dismissHint();
        saveAnswer({ shareToken, playerId, date, answer }).catch((error: unknown) =>
          showToast(errorMessage(error, "answer")),
        );
      }}
      onFillRest={(fillMonth) => {
        if (hintVisible) dismissHint();
        const saving = fillRest({ shareToken, playerId, month: fillMonth });
        saving.catch((error: unknown) => showToast(errorMessage(error, "fillRest")));
        return saving;
      }}
      onMonthChange={onMonthChange}
      onNotYou={onNotYou}
      {...keepLine}
    />
  );
}

function PlayerLoading() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-4 sm:px-5" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-md" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <Skeleton className="h-16 rounded-lg" />
      <Skeleton className="aspect-square rounded-xl" />
    </div>
  );
}

function withAnswer(answers: Record<IsoDate, Answer>, date: IsoDate, answer: Answer | null) {
  const next = { ...answers };
  if (answer === null) delete next[date];
  else next[date] = answer;
  return next;
}

function withRestBusy(answers: Record<IsoDate, Answer>, month: IsoMonth, today: IsoDate) {
  const rest = fillRestDates(month, today, new Set(Object.keys(answers)));
  return { ...answers, ...Object.fromEntries(rest.map((date) => [date, "busy" as const])) };
}
