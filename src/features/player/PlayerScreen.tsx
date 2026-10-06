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
import type { KeepOutcome } from "../account/keep";
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
  const { keepWithGoogle, logInWithGoogle } = account;
  const [sheet, setSheet] = useState<"logIn" | "keep" | null>(null);
  const [releasedId, setReleasedId] = useState<Id<"players"> | null>(null);
  if (releasedId !== null && group.claimedPlayerId !== releasedId) setReleasedId(null);
  const claimed = group.players.find(
    ({ _id }) => _id === group.claimedPlayerId && _id !== releasedId,
  );
  if (claimed && identity?.playerId !== claimed._id) {
    setIdentity({ playerId: claimed._id, name: claimed.name });
  }
  const player = claimed ?? group.players.find(({ _id }) => _id === identity?.playerId);
  const removed = identity !== null && player === undefined;
  const keeper = useKeeper(refusalOnReturn(account, shareToken), () => showToast(KEPT));
  const { keepOnReturn } = account;
  const keep = player && { shareToken, playerId: player._id };

  useEffect(() => {
    if (removed) forgetPlayer(group.groupId);
  }, [removed, group.groupId]);

  useEffect(() => {
    if (keepOnReturn?.outcome.kept && keepOnReturn.keep.shareToken === shareToken) showToast(KEPT);
  }, [keepOnReturn, shareToken, showToast]);

  useEffect(() => {
    if (claimed) rememberPlayer(group.groupId, { playerId: claimed._id, name: claimed.name });
  }, [claimed, group.groupId]);

  function answerAs(next: PlayerIdentity | null) {
    if (next) rememberPlayer(group.groupId, next);
    else forgetPlayer(group.groupId);
    setIdentity(next);
  }

  function notYou() {
    account.forgetPendingKeep();
    answerAs(null);
    if (!claimed) return;
    setReleasedId(claimed._id);
    release({ groupId: group.groupId }).catch((error: unknown) => {
      setReleasedId(null);
      showToast(errorMessage(error, "keep"));
    });
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
          onNotYou={notYou}
          showToast={showToast}
          keep={player._id === group.claimedPlayerId ? "kept" : keeper.state}
          keepRefusal={keeper.refusal}
          onKeep={() => {
            if (account.status !== "account") setSheet("keep");
            else if (keep) keeper.keepThrough(() => account.keepNow(keep)).catch(keeper.refuseSave);
          }}
          accountControl={accountControl}
        />
      )}
      {player !== undefined && <Toast message={toast} />}
      {sheet === "keep" && player && keep ? (
        <AccountSheet
          open
          intent="keep"
          groupName={group.name}
          playerName={player.name}
          movesGroups={account.status === "anonymous"}
          onSubmit={(input) => keeper.keepThrough(() => account.keepWithPassword(keep, input))}
          onContinueWithGoogle={keepWithGoogle && (() => keepWithGoogle(keep))}
          onClose={() => setSheet(null)}
        />
      ) : (
        <AccountSheet
          open={sheet === "logIn"}
          intent="logIn"
          forPlayer
          onSubmit={account.logIn}
          onContinueWithGoogle={logInWithGoogle && (() => logInWithGoogle(`/s/${shareToken}`))}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

function useKeeper(refusalOnReturn: string | null, onKept: () => void) {
  const [state, setState] = useState<"offer" | "keeping">("offer");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  async function keepThrough(run: () => Promise<KeepOutcome>) {
    setTried(true);
    setState("keeping");
    setRefusal(null);
    try {
      const outcome = await run();
      if (outcome.kept) onKept();
      else setRefusal(errorMessage(outcome.error, "keep"));
    } finally {
      setState("offer");
    }
  }

  return {
    state,
    refusal: tried ? refusal : refusalOnReturn,
    keepThrough,
    refuseSave: (error: unknown) => setRefusal(errorMessage(error, "save")),
  };
}

function refusalOnReturn(account: Account, shareToken: string) {
  const returned = account.keepOnReturn;
  if (returned?.keep.shareToken !== shareToken) return null;
  if (account.refusalOnReturn !== undefined) return errorMessage(account.refusalOnReturn, "save");
  return returned.outcome.kept ? null : errorMessage(returned.outcome.error, "keep");
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
  return <HeaderAccount status="account" email={email} onLogOut={onLogOut} />;
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
  const [answered, setAnswered] = useState(false);
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

  if (!answered && answers && Object.keys(answers).length > 0) setAnswered(true);

  if (answers === null) return <NotFoundScreen kind="link" />;

  return (
    <PlayerCalendar
      groupId={group.groupId}
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
        const saving = saveAnswer({ shareToken, playerId, date, answer });
        saving.catch((error: unknown) => showToast(errorMessage(error, "answer")));
        return saving;
      }}
      onFillRest={(fillMonth) => {
        if (hintVisible) dismissHint();
        const saving = fillRest({ shareToken, playerId, month: fillMonth });
        saving.catch((error: unknown) => showToast(errorMessage(error, "fillRest")));
        return saving;
      }}
      onMonthChange={onMonthChange}
      onNotYou={onNotYou}
      keepOffered={answered}
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
