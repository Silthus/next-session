import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { fillRestDates, type Answer } from "../../../shared/answers";
import { monthOf, type IsoDate, type IsoMonth } from "../../../shared/dates";
import { Skeleton } from "../../ui/Skeleton";
import { Toast } from "../../ui/Toast";
import { Join } from "./Join";
import { LinkGone } from "./LinkGone";
import { PlayerCalendar } from "./PlayerCalendar";
import { answerErrorCopy, appErrorOf, fillRestErrorCopy } from "./playerErrors";
import {
  browserStorage,
  forgetPlayer,
  hasSeenHint,
  markHintSeen,
  recallPlayer,
  rememberPlayer,
  type PlayerIdentity,
} from "./playerIdentity";
import { visibleMonth } from "./playerMonth";
import { useTodayUtc } from "./useTodayUtc";

type PlayerGroupView = NonNullable<FunctionReturnType<typeof api.player.group>>;
type MonthChange = (month: IsoMonth) => void;

const TOAST_MS = 4000;
const storage = browserStorage();

export function PlayerScreen({
  shareToken,
  requestedMonth,
  onMonthChange,
}: {
  shareToken: string;
  requestedMonth: string | undefined;
  onMonthChange: MonthChange;
}) {
  const group = useQuery(api.player.group, { shareToken });
  if (group === undefined) return <PlayerLoading />;
  if (group === null) return <LinkGone />;
  return (
    <PlayerGroup
      key={group.groupId}
      shareToken={shareToken}
      group={group}
      requestedMonth={requestedMonth}
      onMonthChange={onMonthChange}
    />
  );
}

function PlayerGroup({
  shareToken,
  group,
  requestedMonth,
  onMonthChange,
}: {
  shareToken: string;
  group: PlayerGroupView;
  requestedMonth: string | undefined;
  onMonthChange: MonthChange;
}) {
  const [identity, setIdentity] = useState(() => recallPlayer(storage, group.groupId));
  const join = useMutation(api.player.join);
  const player = group.players.find(({ _id }) => _id === identity?.playerId);
  const removed = identity !== null && player === undefined;

  useEffect(() => {
    if (removed) forgetPlayer(storage, group.groupId);
  }, [removed, group.groupId]);

  function answerAs(next: PlayerIdentity | null) {
    if (next) rememberPlayer(storage, group.groupId, next);
    else forgetPlayer(storage, group.groupId);
    setIdentity(next);
  }

  if (player === undefined) {
    return (
      <Join
        groupName={group.name}
        players={group.players}
        removed={removed}
        onPick={({ _id, name }) => answerAs({ playerId: _id, name })}
        onJoin={async (name) => {
          const playerId = await join({ shareToken, name });
          answerAs({ playerId, name: name.trim() });
        }}
      />
    );
  }

  return (
    <PlayerAnswers
      shareToken={shareToken}
      group={group}
      player={{ playerId: player._id, name: player.name }}
      requestedMonth={requestedMonth}
      onMonthChange={onMonthChange}
      onNotYou={() => answerAs(null)}
    />
  );
}

function PlayerAnswers({
  shareToken,
  group,
  player,
  requestedMonth,
  onMonthChange,
  onNotYou,
}: {
  shareToken: string;
  group: PlayerGroupView;
  player: PlayerIdentity;
  requestedMonth: string | undefined;
  onMonthChange: MonthChange;
  onNotYou: () => void;
}) {
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
  const [hintVisible, setHintVisible] = useState(() => !hasSeenHint(storage, group.groupId));
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  function dismissHint() {
    markHintSeen(storage, group.groupId);
    setHintVisible(false);
  }

  function showToast(message: string) {
    setToast((current) => ({ message, id: (current?.id ?? 0) + 1 }));
  }

  if (answers === null) return <LinkGone />;

  return (
    <>
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
            showToast(answerErrorCopy(appErrorOf(error))),
          );
        }}
        onFillRest={(fillMonth) => {
          if (hintVisible) dismissHint();
          fillRest({ shareToken, playerId, month: fillMonth }).catch((error: unknown) =>
            showToast(fillRestErrorCopy(appErrorOf(error))),
          );
        }}
        onMonthChange={onMonthChange}
        onNotYou={onNotYou}
      />
      {toast && <Toast key={toast.id}>{toast.message}</Toast>}
    </>
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
