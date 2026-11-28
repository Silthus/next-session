# Shared availability across Groups

Status: locked with Michael on 2026-11-28, in three architecture rounds. Decision record: [ADR-0016](../adr/0016-claimed-players-are-locked-and-share-one-availability.md).

## The question

Michael: "Make it so that players with an account automatically share their availability across all groups they are part of. So they only need to enter their availability once. A date marked as playing by the GM should auto mark the date on their other groups as cannot play."

How should Answers be stored and shared so that an Account enters them once, and who may change them?

## How it works today

- An Answer belongs to one Player in one Group: an `answers` row with `playerId`, `date` and free, maybe or busy (`convex/schema.ts`). An Account links to at most 50 Claimed Players through `players.userId` (`shared/limits.ts`).
- Nine places in five files read or write `answers`: `convex/player.ts` (the player calendar, the others overlay, `writeAnswer`, and Fill Rest, which inserts on its own), `convex/schedule.ts` (the GM month view and Best Nights), `convex/me.ts` (open dates on My groups), `convex/roster.ts` and `convex/model/groups.ts` (deletes).
- Anyone with the Share Link answers as any Player, Claimed ones included (ADR-0004, ADR-0010).
- A Session publishes in `settle` after its 30-second Undo window (`convex/sessionLifecycle.ts`), where Session mail and Reminders hook in. A cancel inside the first Undo window deletes the Session and never publishes.

## Locked decisions

1. **One availability per Account.** Every Group where an Account has a Claimed Player reads the same Answers. There are no per-Group overrides and no copy prompt. Players without an Account keep per-Group Answers as today.
2. **Claimed Players are locked to their Account.** The name picker marks a Claimed Player with a lock. A visitor who picks it gets the Account sheet with Log in first; once signed in as that Account, the page opens as that Player, and as another Account it shows the existing "Another account keeps this name" line. The server refuses answers, Fill Rest and answer reads for a Claimed Player from anyone but its Account (`PLAYER_LOCKED`).
3. **A remembered name locks too.** A signed-out device that remembers a Claimed Player shows the name picker with that name locked and "Log in to answer as <name>". It opens no sheet on its own.
4. **Claim merges, release copies back.** Claiming a Player with Answers keeps the Account's Answers where it has them and fills the rest from the Player's, then the Player's rows go. Releasing (Not you?, Remove from my groups) copies the Account's Answers back into the Player's rows, so the Group keeps them (ADR-0010: releasing never deletes Answers).
5. **Switch-over takes the most cautious answer.** For Accounts already in several Groups, a date with different Answers becomes busy over maybe over free, with no prompt.
6. **A scheduled Session blocks the night elsewhere.** When Group X publishes a scheduled Session on D, each Account in X that answered free or maybe on D, and X's GM Account, reads busy on D in its other Groups. A published cancel removes it, and a Session undone inside its Undo window never blocks.
7. **Only the player sees why.** In Group Y the player sees "Busy · playing in <Group X>"; Y's GM and other players see busy.
8. **Four pull requests, the lock first.** The lock; `convex/availability.ts` owning every `answers` read and write with no behaviour change; the shared list with claim, release and switch-over; the Session blocks.

## Contracts

### `convex/availability.ts` (PR 2, grown in PR 3 and PR 4)

The only module that touches `answers`, and later `accountAnswers` and `playingNights`. Endpoints keep auth, rate limits, telemetry and view shaping.

```ts
type Answers = Record<IsoDate, Answer>;

answersOf(ctx, player: Doc<"players">, month: IsoMonth): Promise<Answers>;
groupAnswersIn(ctx, groupId: Id<"groups">, month: IsoMonth): Promise<{ playerId: Id<"players">; date: IsoDate; answer: Answer }[]>;
openDateCount(ctx, player: Doc<"players">, from: IsoDate, to: IsoDate): Promise<number>;
setAnswer(ctx, player: Doc<"players">, date: IsoDate, answer: Answer | null): Promise<void>;
fillRest(ctx, player: Doc<"players">, month: IsoMonth, today: IsoDate): Promise<void>;
deleteAnswersOf(ctx, playerId: Id<"players">): Promise<void>;
```

PR 3 adds `adoptOnClaim(ctx, account, player)` and `leaveOnRelease(ctx, account, player)`, called inside the claim and release paths of `convex/model/players.ts`. PR 4 adds `sessionPublished(ctx, session, previous)`, called from `settle` next to mail and Reminders.

### Storage

- PR 3: `accountAnswers { userId, date, answer }`, index `by_userId_and_date`. Invariant: a Claimed Player has no `answers` rows; its Answers live on its Account.
- PR 4: `playingNights { userId, date, groupId, sessionId }`, indexes `by_userId_and_date`, `by_sessionId`, `by_groupId`. A night reads busy for the Account in every Group but `groupId`; it is never written into `accountAnswers`. The rows follow the published state: written on a published schedule, deleted on a published cancel and with the Group.

### Errors

- `PLAYER_LOCKED` (PR 1): `answer`, `fillRest`, `answers` and `othersAnswers` on a Claimed Player whose Account is not the caller.

### Performance

- A player calendar reads one index range of at most 31 rows, plus PR 4's `playingNights` range.
- The GM month view reads one range per Claimed Player, at most 100 Players with 31 rows each.
- A switch-over or a claim merge reads at most 50 Groups × 92 Answers for one Account.

## Follow-ups

- **Session lifecycle emits transitions** (Worth exploring): `settle` returns what it published, and mail, Reminders and the blocks subscribe. It would partly reopen ADR-0013.
- **Claim lookups behind `model/players.ts`** (Worth exploring): five raw `by_userId_and_groupId` queries in `recipients.ts`, `me.ts`, `calendarFiles.ts` and `reminders.ts`, and `changeRecipientSet` moving out of `sessionMail.ts`.
- **One read model for the GM view, the player reads and My groups** (Speculative): mostly covered by `availability.ts`.
