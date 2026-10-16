# Next Session standalone: architecture and build plan

Status: accepted (self-accepted under the map's autonomy note, 2026-10-02). Resolves [#7](https://github.com/Silthus/next-session/issues/7) on map [#1](https://github.com/Silthus/next-session/issues/1).

Inputs: [source inventory](https://github.com/Silthus/next-session/blob/research/source-inventory/docs/research/source-inventory.md) (#2), [sign-up flows](https://github.com/Silthus/next-session/blob/research/signup-flows/docs/research/signup-flows.md) (#3), [hosting and auth](https://github.com/Silthus/next-session/blob/research/hosting-and-auth/docs/research/hosting-and-auth.md) (#4), [DESIGN.md](../DESIGN.md) (#6), Convex provisioning (#5), Cloudflare setup (#8). Behaviour source of truth: `Omni-GM/lonir` (`apps/nextsession`, `packages/schedule`, the schedule surface of `packages/backend/convex`).

Vocabulary: [CONTEXT.md](../CONTEXT.md). Hard-to-reverse decisions: [docs/adr/](adr/).

## 1. What we build

Next Session is one Vite SPA plus one Convex backend.

- A visitor clicks **Create your link** on `/` and holds a Share Link one click later, with no fields. That click creates an Anonymous GM, its first Group, and its Legal Acceptance in one transaction.
- The GM opens the Group at `/g/<groupId>`: a heat-map month grid, the day panel, Best Nights, the Roster, Sessions, and the Share Link.
- Players open `/s/<shareToken>`, pick or type a name, and tap days, with no account. A Player who wants their Groups on every device creates an Account and keeps the Group; My groups (`/me`) then lists every Group they run or play in, with its upcoming Sessions (§12).
- The GM can **Save** at any time with an email and a password. Signing in to an Account that already has Groups adds the new ones and replaces nothing.
- Unsaved Groups expire after 30 days without activity.

Out of scope, per the map: workspaces, worlds, prep, debriefs, milestones, chats, cues, the early-access gate, the hand-off, Lonir branding, and migrating Lonir data.

## 2. Architecture

```
Browser ──HTTPS──▶ Cloudflare Worker "next-session" (next-session.link)
   │                 ├─ /s/<8-char legacy token>, /groups* → 302 to Lonir (ADR-0005)
   │                 └─ everything else → static assets from dist/, SPA fallback
   └──WebSocket──▶ Convex prod "pleasant-sockeye-672" (queries, mutations, Convex Auth, crons)
```

- SPA on Cloudflare Workers Static Assets, backend on Convex Free ([ADR-0001](adr/0001-spa-on-cloudflare-workers-backend-on-convex-free.md)).
- Convex Auth (`@convex-dev/auth` 0.0.96) with two providers: a rate-limited Anonymous provider for Create your link, and Password for Accounts ([ADR-0002](adr/0002-anonymous-first-gm.md)). Google OAuth and Resend email codes are later upgrades that need Michael's credentials.
- `@convex-dev/rate-limiter` for every public write ([ADR-0007](adr/0007-rate-limits-without-client-ip.md)).
- One package, three source roots: `shared/` (pure domain), `convex/` (backend), `src/` (UI) ([ADR-0008](adr/0008-single-package-with-shared-domain-core.md)).

### Toolchain

| Concern | Choice |
| --- | --- |
| Package manager and runner | Bun (never npm or yarn) |
| Language | TypeScript, `strict`, `noUncheckedIndexedAccess` |
| UI | React 19, Vite, TanStack Router (file routes, `autoCodeSplitting`), Tailwind v4 (`@tailwindcss/vite`) |
| Backend | Convex (CLI 1.46+), Convex Auth 0.0.96, `@convex-dev/rate-limiter` |
| Fonts | Self-hosted through Fontsource (`@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/inter`, `@fontsource/jetbrains-mono`), not the Google Fonts CDN. Loading Google's CDN sends visitor IPs to Google, which German courts have ruled needs consent. This deviates from DESIGN.md D6 on purpose. |
| Unit and integration tests | Vitest with three projects: `shared` (node), `convex` (`edge-runtime`, `convex-test`), `ui` (jsdom, Testing Library) |
| End-to-end tests | Playwright (chromium) against `vite dev` and a local Convex backend |
| Lint and format | ESLint (typescript-eslint, react-hooks, `@convex-dev/eslint-plugin`) and Prettier |
| Gate | `bun run check` = `tsc` (app, node, and convex projects) + `eslint .` + `prettier --check .` + `vitest run` + `vite build` + `wrangler deploy --dry-run` |
| Hosting | `wrangler` 4.x deploys `dist/` and `worker/index.ts` |
| Browser floor | Evergreen browsers with `color-mix(in oklab)`: Chrome/Edge 111, Safari 16.2, Firefox 113. Vite `build.target` `es2022`. |

## 3. Domain model and Convex schema

Terms are in [CONTEXT.md](../CONTEXT.md). Lonir's `memberships` become `players`, `availability` becomes `answers` with `free | maybe | busy`, and `sessions` loses `status` and `sessionEntityId`. Groups lose `workspaceId`.

```ts
// convex/schema.ts
import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const answerValue = v.union(v.literal("free"), v.literal("maybe"), v.literal("busy"));
export const sessionState = v.union(v.literal("scheduled"), v.literal("cancelled"));
export const publishedSession = v.object({
  state: sessionState,
  start: v.optional(v.number()), // epoch ms, from shared/sessionTime.ts
  end: v.optional(v.number()),
  location: v.optional(v.string()),
  summary: v.optional(v.string()), // the Group name at publish time
  timeZone: v.optional(v.string()), // the Group's zone at publish time; missing before Session mail, read as the Group's zone (§15.8)
  revision: v.number(),
}); // start, end and summary are missing only on rows published before the Time and place deploy

export default defineSchema({
  ...authTables,
  users: defineTable({
    // Convex Auth fields
    name: v.optional(v.string()),
    image: v.optional(v.union(v.string(), v.null())), // Google's picture address, §5.7
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Legal Acceptance
    acceptedTermsVersion: v.optional(v.string()),
    acceptedPrivacyVersion: v.optional(v.string()),
    acceptedLegalAt: v.optional(v.number()),
    // Google profile picture copy, §5.7
    profileImageId: v.optional(v.id("_storage")),
    profileImageFrom: v.optional(v.string()),
    // Calendar feed, §14.2
    calendarFeedToken: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_calendarFeedToken", ["calendarFeedToken"]),

  groups: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    shareToken: v.string(),
    previousShareToken: v.optional(v.string()), // for Undo after a rotation
    shareTokenRotatedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()), // set only while the Group is unsaved
    // Time and place; a missing field means 19:00, 240 minutes, Europe/Berlin, no location
    startTime: v.optional(v.string()), // "HH:MM"; stored means the GM saved the page once
    lengthMinutes: v.optional(v.number()),
    timeZone: v.optional(v.string()), // the creator's browser zone, then the GM's choice
    location: v.optional(v.string()), // trimmed, at most 200 characters
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_shareToken", ["shareToken"])
    .index("by_expiresAt", ["expiresAt"]),

  players: defineTable({
    groupId: v.id("groups"),
    name: v.string(),
    nameKey: v.string(), // normalized name for the per-Group uniqueness check
    userId: v.optional(v.id("users")), // the Account that claimed this Player (§12)
  })
    .index("by_groupId_and_nameKey", ["groupId", "nameKey"])
    .index("by_userId_and_groupId", ["userId", "groupId"]),

  answers: defineTable({
    groupId: v.id("groups"),
    playerId: v.id("players"),
    date: v.string(), // YYYY-MM-DD, UTC calendar date
    answer: answerValue,
  })
    .index("by_groupId_and_date", ["groupId", "date"])
    .index("by_playerId_and_date", ["playerId", "date"]),

  sessions: defineTable({
    groupId: v.id("groups"),
    date: v.string(),
    state: v.optional(sessionState), // missing means scheduled
    changedAt: v.optional(v.number()), // the latest change, which the settle job compares
    published: v.optional(publishedSession), // what the outside world knows; missing means never published
    sequence: v.optional(v.number()), // the last calendar SEQUENCE sent; missing means 0 (§15)
    wholeRoundSent: v.optional(v.boolean()), // a round went to the whole calendar recipient set (§15.3, §15.10)
  })
    .index("by_groupId_and_date", ["groupId", "date"])
    .index("by_date", ["date"]), // the one-time invites read every Group's upcoming Sessions (§15.10)

  calendarCancellations: defineTable({ // a deleted Group's calendar entries still to cancel (§15.5)
    groupId: v.id("groups"),
    ownerId: v.id("users"),
    recipients: v.array(v.id("users")), // the eligible calendar recipients at deletion
    nights: v.array(frozenNight), // {date, entry: {uid, sequence, start, end, summary}}
    cursor: v.number(), // recipient × night pairs queued so far
  }),

  mailVolume: defineTable({
    day: v.string(), // UTC day
    count: v.number(),
    provider: v.optional(mailProvider), // "resend" | "workflows"; missing reads as workflows
  }).index("by_provider_and_day", ["provider", "day"]),

  saveClaims: defineTable({
    anonymousUserId: v.id("users"),
    codeHash: v.string(), // SHA-256 of the claim code, base64url
    expiresAt: v.number(),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_anonymousUserId", ["anonymousUserId"]),
});
```

Invariants (each one has a backend test):

1. Every Group has exactly one owner, and `ownerId` is required.
2. `shareToken` is unique across Groups. New tokens are 10 characters from `A-Za-z0-9_-` (60 bits), minted with up to 5 attempts against `by_shareToken`. Legacy Lonir tokens are 8 characters, so the length tells them apart ([ADR-0005](adr/0005-legacy-share-links-redirect-to-lonir.md)).
3. A Group has at most one Session per date, cancelled ones included, and at most one Answer per Player per date.
4. `expiresAt` is set if and only if the owner is an Anonymous GM.
5. An Anonymous GM owns at least one Group. Deleting its last Group, by hand or by Expiry, deletes the Anonymous GM and its auth rows.
6. Names are trimmed, inner whitespace is collapsed, and they are 1 to 60 characters. `nameKey` is the lowercased name. Player names are unique per Group by `nameKey`.
7. Limits: 100 Players per Group, 50 Groups per GM.
8. Dates are UTC calendar dates (ported from Lonir ADR-0047). The Booking Window runs from today to the last day of the current month + 2. Answers, Fill Rest, and Sessions outside it are rejected; past dates are read-only.
9. A Player is claimed by at most one Account, and only by an Account, never an Anonymous GM. An Account claims at most one Player per Group and at most 50 Players in total. A Player row is deleted only by the GM (`roster.removePlayer`, `groups.remove`) or by its Group's Expiry; releasing a claim, **Not you?**, and signing out never delete it (§12).
10. Every change to a Session goes through `convex/sessionLifecycle.ts` ([ADR-0013](adr/0013-sessions-publish-a-snapshot-after-the-undo-window.md)). Only its `settle` job writes `published`, no sooner than 30 seconds after the change that caused it, and `published.revision` grows by one per publish. Session mail reads only `published`. Cancel deletes a Session only when it was never published.

## 4. Backend modules and functions

Every public function declares `args` and `returns` validators. Failures throw `ConvexError<{ code: ErrorCode }>`, and the UI maps codes to copy in one place (`src/lib/errors.ts`).

`ErrorCode` = `NOT_FOUND | INVALID_NAME | NAME_TAKEN | ROSTER_FULL | TOO_MANY_GROUPS | OUT_OF_WINDOW | SESSION_EXISTS | UNDO_EXPIRED | CLAIM_INVALID | RATE_LIMITED | UNAUTHENTICATED | EMAIL_TAKEN | INVALID_CREDENTIALS | WEAK_PASSWORD | PLAYER_CLAIMED | INVALID_SETTINGS | SESSION_CANCELLED`.

### Access (`convex/model/access.ts`)

The one seam where authorization happens. Public functions never read `groups` by id directly.

- `requireGm(ctx) → Doc<"users">`: the signed-in user, or `UNAUTHENTICATED`.
- `currentAccount(ctx) → Doc<"users"> | null` and `requireAccount(ctx) → Doc<"users">`: the signed-in user if it is an Account, not an Anonymous GM (§12).
- `ownedGroup(ctx, groupId) → { gm, group }`: the Group if the caller owns it. A missing Group and a foreign Group both throw `NOT_FOUND`, so ids cannot be probed.
- `ownedPlayer(ctx, playerId) → { gm, group, player }` and `ownedSession(ctx, sessionId) → { gm, group, session }`: the same check through the row's Group, reading the GM once. Another GM's Player or Session looks missing too.
- `findOwnedGroup(ctx, rawGroupId) → Doc<"groups"> | null`: the `null`-returning version for queries, which also takes a malformed id.
- `groupByShareToken(ctx, shareToken) → Doc<"groups"> | null`.
- `playerOnShareLink(ctx, shareToken, playerId) → { group, player }`: throws `NOT_FOUND` unless the Player belongs to the Group behind that token.
- `findPlayerOnShareLink(ctx, shareToken, rawPlayerId) → Doc<"players"> | null`: the `null`-returning version for queries.
- `touchGroup(ctx, group)`: pushes `expiresAt` to now + 30 days for an Unsaved Group, writing at most once a day so answer taps do not churn the Group row.

An Unsaved Group past `expiresAt` that the daily sweep (§5.5) has not reached yet stays reachable, and the next write through `touchGroup` revives it.

The name and Roster checks that `roster` and `player` share (`validName`, `ensureNameIsFree`, `ensureRosterHasRoom`) live in `convex/model/players.ts`.

### Public functions

| Module | Function | Kind | Args → result | Notes |
| --- | --- | --- | --- | --- |
| `groups` | `mine` | query | `{}` → `GroupListItem[]` (id, name, playerCount) | Owner's Groups, oldest first |
| | `get` | query | `{groupId}` → `GroupView \| null` | id, name, shareToken, expiresAt, canUndoRotate. `null` for missing or foreign ids, so the UI falls back to the first Group |
| | `create` | mutation | `{timeZone?}` → `Id<"groups">` | "My group", fresh token, `expiresAt` for an Anonymous GM, and the browser's time zone when `Intl` knows it (an unknown zone is dropped, never refused). Rate limit `createGroup` |
| | `settings` | query | `{groupId}` → `{startTime, lengthMinutes, timeZone, location?, saved} \| null` | The Group's Time and place with the defaults filled; `saved` once the GM saved it. `null` for missing or foreign ids |
| | `updateSettings` | mutation | `{groupId, startTime, lengthMinutes, timeZone, location}` → `null` | `INVALID_SETTINGS` for a start time off `HH:MM`, a length off 30–720 or the 15-minute step, a zone `Intl` doesn't know, or a location over 200 characters. Trims the location and clears it when empty. Writes all four fields, touches the Group, and settles its scheduled upcoming Sessions through `groupChanged` (§12.6). Rate limit `gmEdit` |
| | `rename` | mutation | `{groupId, name}` → `null` | Name rules. Settles the Group's scheduled upcoming Sessions through `groupChanged` (§12.6), so calendars get the new name after the Undo window |
| | `remove` | mutation | `{groupId}` → `null` | Deletes the Group row, then schedules `internal.groups.deleteChildren` (batches of 200). Ends an Anonymous GM that owned only this Group |
| | `rotateShareToken` | mutation | `{groupId}` → `null` | Keeps `previousShareToken` and `shareTokenRotatedAt` |
| | `undoRotateShareToken` | mutation | `{groupId}` → `null` | Within 30 s of the rotation, else `UNDO_EXPIRED` |
| `schedule` | `month` | query | `{groupId, month: "YYYY-MM"}` → `{players, answers, sessions, timeAndPlace}` | The Roster, the month's Answers, and every Session of the Group, Cancelled ones included (a few dozen at most), as raw rows: `{_id, date, state, published, overrides}` with the effective `startTime`, `lengthMinutes` and `location`: the Session's own, else the Group's. `overrides` names the fields the Session has of its own, for the day panel. `published` tells the optimistic cancel whether the Session disappears or turns Cancelled. `timeAndPlace` is the Group's own, with its `timeZone`. All derivation happens in `shared/monthSummary.ts` on the client |
| `roster` | `addPlayer` | mutation | `{groupId, name}` → `Id<"players">` | Name rules, `NAME_TAKEN`, `ROSTER_FULL` |
| | `renamePlayer` | mutation | `{playerId, name}` → `null` | Owner check through the Player's Group |
| | `removePlayer` | mutation | `{playerId}` → `null` | Deletes the Player's Answers too |
| `sessions` | `schedule` | mutation | `{groupId, date}` → `Id<"sessions">` | `OUT_OF_WINDOW` for past or outside dates, `SESSION_EXISTS` for a scheduled Session. Restores a Cancelled Session in place with its id: Undo of a cancel and Schedule again are this call |
| | `cancel` | mutation | `{sessionId}` → `null` | `OUT_OF_WINDOW` for a past date (today still counts). Deletes a Session that was never published, else marks it Cancelled. A Cancelled Session is a no-op success |
| | `updateDetails` | mutation | `{sessionId, startTime?, lengthMinutes?, location?}` → `null` | Each field is a value (the Session's own), `null` (follow the Group again) or absent (left alone). `OUT_OF_WINDOW` for a past date, `SESSION_CANCELLED` for a Cancelled Session, `INVALID_SETTINGS` on the same rules as `updateSettings`. Trims the location; an empty one means no place this night. Changes the Session through `updateSessionDetails` (§12.6) and touches the Group. A call that changes nothing is a no-op success. Rate limit `gmEdit` |
| `player` | `group` | query | `{shareToken}` → `PlayerGroupView \| null` | groupId, name, Players (id, name), every Session of the Group as `{date, state}` with its effective `startTime`, `lengthMinutes` and `location`, Cancelled ones included (the client filters them by the Booking Window), the Group's `timeZone`, `claimedPlayerId`: the caller's Claimed Player in this Group, or `null`, and `opensAsGm`: whether the caller's Account runs this Group without a Claimed Player in it, which sends the Share Link on to `/g/<groupId>`. `null` renders the not-found page |
| | `answers` | query | `{shareToken, playerId, month}` → `Record<date, Answer> \| null` | `null` for an unknown token, a foreign or removed Player, or a malformed id or month |
| | `join` | mutation | `{shareToken, name}` → `Id<"players">` | `NAME_TAKEN` carries the existing `playerId` so the UI can highlight the chip. Rate limit `joinGroup`. An Account caller claims the new Player (§12) |
| | `claim` | mutation | `{shareToken, playerId}` → `null` | Account only. Moves the caller's claim in this Group to the Player. `PLAYER_CLAIMED` if another Account holds it. Rate limit `claimPlayer` |
| | `release` | mutation | `{groupId}` → `null` | Account only. Clears the caller's claim in that Group, if any. Rate limit `claimPlayer` |
| | `answer` | mutation | `{shareToken, playerId, date, answer: Answer \| null}` → `null` | Upsert, or delete on `null`. Rate limit `answer`. Touches the Group |
| | `fillRest` | mutation | `{shareToken, playerId, month}` → `null` | Writes `busy` to every unanswered bookable date of the month in one mutation |
| `me` | `groups` | query | `{today}` → `MyGroups \| null` | Account only, `null` otherwise. The Groups the caller runs and the Groups where it has a Claimed Player, with the next five Sessions as of `today`, Cancelled ones included, as `{date, state}` with each one's effective `startTime`, `lengthMinutes` and `location`, and each Group's `timeZone` (§12) |
| | `calendarFeed` | mutation | `{}` → `{url}` | Account only. Mints the Calendar feed token on the first call and returns the same URL after (§14.2). Rate limit `calendarFeed` on the mint only |
| | `resetCalendarFeed` | mutation | `{}` → `{url}` | Account only. **Reset feed link**: replaces the token at once, with no Undo (§14.2). Rate limit `calendarFeed` |
| `account` | `me` | query | `{}` → `{isAnonymous, email} \| null` | |
| | `startSave` | mutation | `{}` → `{code}` | Anonymous GM only. 32 random bytes, stored hashed, 10-minute TTL. Rate limit `startSave` |
| | `finishSave` | mutation | `{code}` → `{groupIds}` | Account only. See §5.3 |
| `auth` | `signIn`, `signOut`, `store` | Convex Auth | | |

Internal: `groups.deleteChildren`, `cleanup.sweepExpiredGroups` (cron), `sessionLifecycle.settle` (§12.6), `backfill.publishLegacySessions` and `backfill.emptyRetiredMailStates` (run once after the Cancelled Session deploys), `backfill.widenPublishedSnapshots` (run once after the Time and place deploy: fills `start`, `end` and `summary` into every `published` at the same revision, with what the code before Time and place published: the usual 19:00 for 4 hours in Europe/Berlin and no place), `calendarFiles.groupDownload` and `calendarFiles.accountFeed` (§14), `oneTimeInvites.inviteScheduledSessions` (run once at the Resend switch-on, §15.10), `sessionMail.drainCancellations` (§15.5), `auth.keepFirstGroupTimeZone` (§5.2), `rateLimits` component setup in `convex/convex.config.ts` and limit definitions in `convex/model/rateLimits.ts`.

Dropped from Lonir: workspace functions, `gmGetGroupRail` and `gmGetDateAvailability` (the client derives the rail counts and the day panel from `groups.mine` and `schedule.month`), `listSessions`, `getAvailability`, `claimMembership` (a client-only check against `player.group`), early access, consent, client errors, hand-off, activation telemetry.

## 5. Authentication and authorization

### 5.1 Who can do what

| Caller | Can |
| --- | --- |
| Anyone | `player.group`, `player.answers`, `player.join`, `player.answer`, `player.fillRest` with a valid Share Token, within rate limits. `auth.signIn` with `anonymous` or a `password` sign-up (both rate limited), a `password` log in (Convex Auth's throttle), or `google` once its credentials are set (§5.7). `signInOptions.available` |
| Anonymous GM or Account | Everything in `groups`, `schedule`, `roster`, `sessions` for Groups they own. Nothing on Groups they do not own: those look missing |
| Anonymous GM only | `account.startSave` |
| Account only | `account.finishSave`, `auth.signOut` from the UI (an Anonymous GM has no sign-out button, because signing out would lose the Group), `player.claim`, `player.release`, `me.groups` |

The Share Token is the only Player credential ([ADR-0004](adr/0004-share-token-is-the-player-credential.md)); a claim does not change that ([ADR-0010](adr/0010-accounts-claim-players-share-token-still-answers.md)). Anyone with the link can answer as any Player; that is the accepted risk Lonir also took (Lonir ADR-0077). Player identity lives in `localStorage` under `next-session.players`, a map of `groupId → {playerId, name}`, so it survives a token rotation. On load the client checks the remembered Player against `player.group` and forgets it if the GM removed that Player. For a signed-in Account, `claimedPlayerId` wins over the remembered Player (§12).

### 5.2 Create your link

1. The client calls `signIn("anonymous")`.
2. The custom `anonymous` provider (a `ConvexCredentials` provider, about 20 lines, modelled on Convex Auth's `Anonymous`) consumes the global `anonymousSignUp` limit through `ctx.runMutation`, then creates the user with `isAnonymous: true` and the current Legal Acceptance stamps from `shared/legal.ts`.
3. `callbacks.afterUserCreatedOrUpdated` sees a new anonymous user and inserts the first Group ("My group", fresh token, `expiresAt`) in the same mutation. The user, the Group, and the Legal Acceptance commit together or not at all.
4. The client passes the browser's time zone as `signIn("anonymous", {timeZone})`. When `Intl` knows it, the provider stores it on that first Group with `internal.auth.keepFirstGroupTimeZone`. Convex Auth writes every profile field onto the user, so the zone can't ride along in step 3. An unknown or missing zone leaves the Group on Berlin time, and the sign-in never fails on it.
5. The client reads `groups.mine` and shows the Share Link in place of the button.

A signed-in GM who creates another Group calls `groups.create` directly.

### 5.3 Save to an Account

Convex Auth replaces the session on every sign-in and does not link an anonymous user to the account it signs in to (verified in `@convex-dev/auth@0.0.96` `server/implementation/users.ts`: `createOrUpdateUser` receives no prior session, and the Password sign-in flow never reaches the callback). So Save uses a claim code ([ADR-0003](adr/0003-save-by-claim-code-merge-never-replaces.md)):

1. The Anonymous GM opens the Save sheet and enters an email and a password, choosing "Create account" (default) or "I already have one".
2. The client calls `account.startSave` and keeps the code in `sessionStorage` (`next-session.pendingSave`). The claim expires on the server after 10 minutes.
3. The client calls `signIn("password", {email, password, flow: "signUp" | "signIn"})`. On failure nothing changed: the anonymous session still holds the Group.
4. The client calls `account.finishSave({code})`. The server finds the claim by hash, checks it is unexpired, refuses with `TOO_MANY_GROUPS` before moving anything if the Account would own more than 50 Groups (invariant 7; the Groups stay with the anonymous user), then for every Group of the anonymous user: sets `ownerId` to the caller and clears `expiresAt`. It copies the Legal Acceptance onto the Account if the Account has none, deletes the claim, and deletes the anonymous user with its `authAccounts`, `authSessions`, and `authRefreshTokens`.
5. On app start, a leftover `pendingSave` with a signed-in Account retries step 4, so a dropped connection between steps 3 and 4 loses nothing. The recovery holds only in the same tab and within the claim's 10 minutes: `sessionStorage` is per tab, and an expired claim throws `CLAIM_INVALID`. After that the Groups stay with the anonymous user until they expire (§5.5). A second `finishSave` with a used code throws `CLAIM_INVALID`, and the client clears the pending code.

The Account's existing Groups are never read for deletion. A test pins it: an Account with two Groups saves an anonymous one and ends up with three.

Password rules: Convex Auth's `Password` provider, minimum 8 characters, no email verification and no reset in v1. Convex Auth's built-in throttle covers failed sign-ins: 10 wrong passwords lock an Account, and one more attempt comes back every 6 minutes. Creating an Account consumes the global `accountSignUp` limit (§5.4) and stamps the Legal Acceptance, because the sheet carries the same legal line as the landing. **Log in** on the landing opens the same sheet with sign-in only.

`convex/auth.ts` turns the provider's plain errors into codes, so the sheet can tell them apart after production redacts plain errors to "Server Error":

| Code | When |
| --- | --- |
| `WEAK_PASSWORD` | Sign-up with a password shorter than 8 characters |
| `EMAIL_TAKEN` | Sign-up with an email that already has an Account. It never signs in, so password guesses always meet the sign-in throttle |
| `INVALID_CREDENTIALS` | Log in with an unknown email or a wrong password. One code for both, so the sheet says "Wrong email or password" and offers Create account either way. A sign-up or log in with a blank email gets it too |
| `RATE_LIMITED` | Log in to a locked Account (`retryAfter` is 6 minutes), or a sign-up past `accountSignUp` |

### 5.4 Rate limits

Convex functions do not see the client IP, so limits key on what the server can trust ([ADR-0007](adr/0007-rate-limits-without-client-ip.md)). Defined once in `convex/model/rateLimits.ts`:

| Name | Key | Shape |
| --- | --- | --- |
| `anonymousSignUp` | global | token bucket, 30 per minute, capacity 60 |
| `accountSignUp` | global | token bucket, 5 per minute, capacity 20 |
| `createGroup` | GM id | token bucket, 10 per hour, capacity 5 |
| `joinGroup` | Group id | fixed window, 30 per hour |
| `answer` | Player id | token bucket, 120 per minute, capacity 60 (covers fast tapping) |
| `answerPerGroup` | Group id | token bucket, 600 per minute, capacity 300, in 10 shards |
| `startSave` | GM id | fixed window, 10 per hour |
| `gmEdit` | GM id | token bucket, 120 per minute, capacity 60 |
| `claimPlayer` | Account id | token bucket, 30 per minute, capacity 10 (`player.claim` and `player.release`) |
| `calendarFeed` | Account id | fixed window, 10 per hour, spent by each new feed token (`me.calendarFeed`'s first call and `me.resetCalendarFeed`) |

`gmEdit` covers every GM mutation without a limit of its own: `groups.rename`, `remove`, `rotateShareToken` and `undoRotateShareToken`, all of `roster` and `sessions`, and `account.finishSave`. It is sized so that no real GM reaches it.

`answerPerGroup` spreads a Group's taps over 10 limiter rows, so Players tapping at once do not conflict on one row. Each tap draws from the fuller of two random shards, so a burst can be refused a little before all 300 tokens are spent.

A hit throws `RATE_LIMITED` with `retryAfter`; the UI shows "Slow down a moment" and reverts the optimistic change.

### 5.5 Expiry of Unsaved Groups

`crons.ts` runs `cleanup.sweepExpiredGroups` daily at 03:17 UTC. It reads `by_expiresAt` for `0 ≤ expiresAt < now` in pages of 50, deletes each Group the same way `groups.remove` does, and reschedules itself while pages remain. The GM surface shows the date ("Saved for 30 quiet days, until Nov 1"), and the Terms and the Privacy Policy say it ([ADR-0006](adr/0006-unsaved-groups-expire-after-30-quiet-days.md)).

### 5.6 Session lifetime

A session lasts 1 year from sign-in (`session.totalDurationMs`), and `session.inactiveDurationMs` is the same year, so a GM who stays away keeps the session until the year is up. After the year, an Account logs in again; an Anonymous GM loses access to its Groups, which is the reason to Save.

Player answers keep an Unsaved Group alive without refreshing the GM's session. A shorter inactivity limit would lock an Anonymous GM who stays away out of a Group that lives on while the Players keep answering. The year costs no storage, because Expiry still deletes the anonymous user with its last Group (§5.5).

Convex Auth's default is 30 days in total, which would lock out an active Anonymous GM after a month, Groups and all.

### 5.7 Continue with Google

Convex Auth's Google provider sits next to Password and Anonymous, always registered. **Continue with Google** shows in the Save sheet and the Log in sheet only while `signInOptions.available` reports `google: true`, which is when `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are both set on the deployment. Without them, the provider stays unused and Password and Anonymous sign-in work as before; a test pins that.

- **The OAuth client.** A Google Cloud OAuth client of type Web application, with the JavaScript origin `https://next-session.link` and the redirect URI `https://pleasant-sockeye-672.convex.site/api/auth/callback/google`. `SITE_URL` sends the browser back to the app.
- **Profile.** Google's `sub` (the account id), the email (trimmed and lowercased), and the picture address as `users.image` (`null` once Google sends none) are kept. No name, no verification flag.
- **Profile picture.** Every Google sign-in compares `users.image` with `users.profileImageFrom`. On a change, `profileImages.copy` downloads the picture (https on `lh3.googleusercontent.com` only, an `image/*` type, at most 512 KB) into Convex file storage, and `profileImages.replace` swaps it in as `profileImageId` and deletes the old file. A removed picture deletes the copy. A picture that fails to download also deletes the old copy, so the letter shows, and the next sign-in tries again. Browsers load the copy from Convex, never from Google's CDN, for the reason the fonts are self-hosted (§2). `account.me` shows the Account its own picture; `schedule.month` shows the GM the picture of each Claimed Player. `player.group` never carries pictures: holding the Share Link does not show other Players' faces. Without a picture, or when it fails to load, the letter avatar stays.
- **Legal Acceptance.** A new Google Account gets the current stamps in `afterUserCreatedOrUpdated`, because the button sits under "By continuing with Google you agree to the Terms and Privacy Policy."
- **Save through Google.** The client calls `account.startSave`, keeps the code in `sessionStorage` as in §5.3, and leaves for Google with `redirectTo` set to the Group's page. `sessionStorage` survives the same-tab round trip. Back on the page, Convex Auth exchanges the `code` from the URL, and the GM surface holds the Group on a loading state while the pending claim is redeemed (step 5 of §5.3), then toasts "Saved" once. When the redeem fails, the Save sheet opens on **Finish saving** for a retry, which also explains an expired claim or the 50-Group cap.
- **No linking by email.** Every Google account (`sub`) is its own Account, and a Google sign-in never joins an existing Account by email (`allowDangerousEmailAccountLinking: false`). Password Accounts never verify their email (§5.3), and Google's `email_verified` is only authoritative for Gmail and Workspace addresses: a re-registered domain or a changed Google login lets a new Google account claim an old address. Linking by email would hand that address's Account, Groups and all, to whoever holds it now. So one email through Password and Google, or through two Google accounts, gives separate Accounts. The alternative, linking a Google identity into a Password Account, needs Password email verification first (an email code through Resend) and a rule that trusts Google's flag only for Gmail and Workspace (`hd`) addresses.

## 6. Frontend

### 6.1 Routes

| Route | Search params | Screen | Guard |
| --- | --- | --- | --- |
| `/` | | Landing with Create your link; the link-created moment in place | A GM with Groups is redirected to the last visited Group (or the first). An Account without Groups of its own is redirected to `/me` |
| `/g/$groupId` | `month` (YYYY-MM), `day` (YYYY-MM-DD) | GM group surface | Signed out → `/`. Missing or foreign id → the first Group, without an error boundary |
| `/g/$groupId/settings` | | Time and place: "When and where you play", the Group's start time, length, time zone and location next to a preview of the calendar entry players get. Save returns to `/g/$groupId` with the toast "Time and place saved" | Signed out → `/`. Missing or foreign id → not found ("Nothing here") |
| `/s/$shareToken` | `month` | Player join, then the player calendar; not-found for an unknown token | None. The Group's GM, signed in with an Account and not playing in the Group, opening the link is sent on to `/g/<groupId>` (replacing the history entry, keeping a valid `month`). A Group that becomes the Account's own while the page is open, as when an Anonymous GM keeps their own link, stays on the player view. A signed-in Account with a Claimed Player in the Group skips Join |
| `/me` | | My groups (§12) | Not an Account → `/` |
| `/terms`, `/privacy`, `/imprint` | | Legal pages | None |
| `*` | | Not found ("Nothing here") | None |

The Save and Log in sheets are component state, not routes (DESIGN D9). Routes are thin: they parse params and render one feature screen.

### 6.2 Source layout

```
src/
  main.tsx              Convex client, ConvexAuthProvider, router
  routes/               TanStack file routes (thin)
  ui/                   design system: tokens (index.css), Logo, Button, Card, Eyebrow, Avatar, Dot,
                        Sheet, Toast, Skeleton, ShareLinkCard, LegalFooter. Presentational only.
  features/
    landing/            Landing, link-created moment
    account/            AccountSheet (save / log in), save.ts (claim orchestration), keep.ts (Keep this group), useGm()
    group/              GroupScreen container, GroupFrame; calendar/ (HeatCalendar, DayPanel); rail/ (GroupSwitcher,
                        BestNights, Players, Sessions, Nudge); settings/ (TimeAndPlaceScreen, TimeAndPlacePage,
                        LocationField)
    player/             PlayerScreen, Join, PlayerCalendar, NextSessions, Progress, playerMonth.ts, KeepGroup
    me/                 MyGroups (§12)
    legal/              LegalPage, rendered from docs/legal/*.md
  lib/                  env.ts, pageTitle.ts, storage.ts (all localStorage keys, prefixed "next-session."), errors.ts,
                        keyboard.ts, timeZone.ts, timeAndPlace.ts (a Session's wall-clock range, the zone named only
                        when the browser's zone differs)
shared/                 dates.ts, answers.ts, monthSummary.ts, names.ts, randomToken.ts, legal.ts, limits.ts
convex/                 schema.ts, model/, groups.ts, schedule.ts, roster.ts, sessions.ts, player.ts, me.ts,
                        account.ts, auth.ts, auth.config.ts, http.ts, crons.ts, cleanup.ts, convex.config.ts
worker/index.ts         legacy-link redirect, then static assets
e2e/                    Playwright specs and helpers
docs/legal/             terms.md, privacy.md, imprint.md
```

Storage keys: `next-session.players` (Player identity), `next-session.lastGroup`, `next-session.nudgeDismissedAt`, `next-session.playerHint.<groupId>`, `next-session.pendingSave` and `next-session.pendingKeep` (sessionStorage). Convex Auth keeps its own tokens.

### 6.3 Decisions on DESIGN.md's open points

| Open point | Call | Alternative |
| --- | --- | --- |
| Anonymous Group expiry | 30 days without activity | 7 days (OmniGM), or never |
| Prefilled share message | "Help me find our next game night. Tap the days you can play, it takes 30 seconds: {url}" | GM-editable text |
| Email code sign-in in v1 | No. The sheet asks for email and password. Google appears when Michael provides an OAuth client | Ship Resend OTP first |
| Player first-visit hint | Non-modal popover on the first tile, per Group, dismissed by the first tap; the cycling tip stays | Cycling tip alone |
| Rotate with Undo | Undo restores the previous token within 30 s (`undoRotateShareToken`); no confirm | Confirm dialog |
| Best Nights across months | Per visible month | Across the Booking Window |
| `?as=` on the player URL | Dropped; identity is local only | Keep it as a shareable "answer as" link |
| Lonir's Player Filter and at-a-glance hover | Dropped; the per-player mini bars show who | Port both |
| Lonir's GM tutorial dialog | Dropped; the link-created moment replaces it (DESIGN D8) | Keep it |
| Re-acceptance gate | Not built in v1: the versions are stamped, and the gate comes with the first version bump | Port Lonir's `LegalAcceptanceGate` now |

### 6.4 Deep modules and test seams

| Module | Interface | Tested through |
| --- | --- | --- |
| `shared/monthSummary.ts` | `summarizeMonth({month, today, players, answers, sessions}) → MonthSummary` (per day: past, bookable, free/maybe/busy/unanswered players, heat 0..1, perfect, session; Best Nights; per-player progress) | Vitest on plain data. The whole GM grid logic sits behind one call |
| `shared/dates.ts` | `bookingWindow(today)`, `isBookable(date, today)`, `isBookableMonth(month, today)`, `monthDays(month)`, `addMonths(month, n)`, `todayUtc(now)` | Vitest |
| `shared/answers.ts` | `nextAnswer(answer)`, `fillRestDates(month, today, answered)` | Vitest |
| `shared/names.ts` | `normalizeName(raw) → {name, nameKey} \| INVALID_NAME`, `playerInitials(name) → string` | Vitest; used by backend, forms, and `Avatar` |
| Backend public API | The functions in §4 | `convex-test` through `api.*`, with `t.withIdentity` for GMs. Every invariant in §3 and every row in §5.1 has a test |
| `src/features/account/save.ts` | `saveGroups({email, password, mode}, deps)`, `saveThroughGoogle(deps)`, and `finishPendingSave(deps)` | Vitest with a fake `deps` (`startSave`, `signIn`, `continueWithGoogle`, `finishSave`, storage). The real adapter wraps Convex |
| `src/features/account/useSaveOnReturn.ts` | `useSaveOnReturn(status, deps) → {resumingSave, savedOnReturn, saveFailedOnReturn, acknowledgeReturn}` | Testing Library's `renderHook` with fake `deps` |
| `src/features/account/keep.ts` | `keepGroup({shareToken, playerId, account}, deps)` and `resumePendingKeep(deps)` (§12.4) | Vitest with a fake `deps` (`claim`, `signIn`, `saveGroups`, storage), like `save.ts` |
| `src/lib/storage.ts` | `rememberPlayer`, `recallPlayer`, `forgetPlayer`, the hint, last Group and nudge keys; each takes the storage last, defaulting to the browser's | Vitest over a fake `Storage` |
| `src/ui/*` and feature views | Props in, callbacks out | Testing Library (render, user events, accessible names) |
| `worker/index.ts` | `legacyRedirect(url) → string \| null` | Vitest |
| The whole product | URLs and clicks | Playwright against `vite dev` + a local Convex backend; the production spec against the deployed URL |

Containers (`GroupScreen`, `PlayerScreen`) are thin glue between Convex hooks and views; Playwright covers them instead of mocking Convex in jsdom.

## 7. Legal

Drafts for Terms, Privacy Policy, and Imprint are in [docs/legal/](legal/), written for Next Session with Michael Reichenbach as provider and controller. They are drafts pending a lawyer's review (Surfaced on #7).

- Version stamps: `shared/legal.ts` exports `LEGAL_VERSIONS = { terms: "1.0", privacy: "1.0", effective: "<launch date>" }`. `{{EFFECTIVE_DATE}}` comes from there.
- Michael's postal address and the contact email are not committed to this public repo. The texts carry `{{CONTROLLER_ADDRESS}}` and `{{CONTACT_EMAIL}}`; `vite build` fills them from the `LEGAL_CONTROLLER_ADDRESS` and `LEGAL_CONTACT_EMAIL` GitHub Actions variables. The deploy ticket sets those variables to the values in Lonir's imprint (the same controller), read from the local clone, never echoed into a log or comment. Local builds show "address on request".
- The drafts drop Lonir's EU ODR-platform paragraph: the platform closed in July 2025.
- No consent banner. Everything stored on the device is strictly necessary or user-requested (§ 25 (2) TDDDG). PostHog runs cookieless and stores nothing on the device (§13.3).
- Players see no legal gate. Every page footer links the three documents.

## 8. CI, deploy, and previews

### Pull requests (`.github/workflows/ci.yml`)

- `check`: `bun install --frozen-lockfile`, `bun run check`.
- `e2e`: run `bun run e2e` against a fresh temporary project and anonymous local Convex backend, with separate frontend, cloud and site ports per run. Set auth through the run’s generated env file, preserve developer env and state, and clean up only that run. Chromium runs the existing suite; mobile WebKit runs the focused sharing/copy project. Upload the report on failure ([ADR-0009](adr/0009-no-pr-previews-e2e-on-local-backend.md)).

### Deploy from `main`

The same workflow runs on `push` to `main`; a `deploy` job `needs: [check, e2e]` with `concurrency: deploy-production`:

1. `bunx convex deploy --cmd 'bun run build' --cmd-url-env-var-name VITE_CONVEX_URL` with `CONVEX_DEPLOY_KEY`.
2. `bunx wrangler deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Smoke: `curl https://next-session.link`. The app, a deep link and a new Share Link answer 200; a legacy `/s/<8 chars>` and a `/groups/...` link answer 302 to the same path on Lonir; a Calendar download for an unknown `/cal/s/<token>.ics` and a Calendar feed for an unknown `/cal/a/<token>.ics` answer 404 with an empty body through the Worker and Convex. The empty body is what tells the calendar routes apart from Convex's own 404 for an unrouted path, which carries a message.

Secrets, set once with `gh secret set` by the deploy ticket from the env files on Michael's machine (never echoed): `CONVEX_DEPLOY_KEY` (from `CONVEX_PROD_DEPLOY_KEY` in `~/.config/next-session/deploy-keys.env`), `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (from `~/.config/next-session/cloudflare.env`). Convex env on prod: `SITE_URL=https://next-session.link`, `JWT_PRIVATE_KEY`, `JWKS`. On dev `helpful-mastiff-82`: the same keys with `SITE_URL=http://localhost:5173`.

### PR previews: none in v1

The dev deployment is shared, and Convex preview deployments are not on the Free plan, so a preview frontend would run against whatever backend the dev deployment holds. CI's e2e job on a local backend is the review evidence instead ([ADR-0009](adr/0009-no-pr-previews-e2e-on-local-backend.md)). Alternative: `wrangler versions upload --preview-alias pr-<n>` against the dev deployment, honest for UI-only PRs.

## 9. Cutover of `next-session.link`

Today a Cloudflare Single Redirect rule 301s every path to Lonir's `little-spaniel-709.convex.site`.

1. **Before:** every feature ticket is merged, the deploy is green, and the production spec passes against `https://next-session.silthus.workers.dev`.
2. **Attach:** add `routes: [{ pattern: "next-session.link", custom_domain: true }]` to `wrangler.jsonc` and deploy. The scoped token has Workers Routes and DNS edit on the zone. Delete the existing apex record first: wrangler's `override_existing_dns_record` does not replace a record it doesn't manage. The redirect rule runs before Workers, so visitors see no change yet.
3. **Michael:** delete the Single Redirect rule in the Cloudflare dashboard (Rules → Redirect Rules). The token cannot edit rulesets on purpose. This is the one step that parks.
4. **Verify:** `/` serves the new app; `/s/<new token>` opens a Group; `/s/<8-char legacy token>` and `/groups/...` answer 302 to the same path on `little-spaniel-709.convex.site`, so Lonir's existing groups keep working; the Resend records (`send`, `resend._domainkey`) are untouched.
5. **Rollback:** Michael re-creates the Single Redirect rule: all incoming requests, a dynamic 301 to `concat("https://little-spaniel-709.convex.site", http.request.uri.path)`, query string preserved. It runs before the Worker, so it takes effect within seconds. The token cannot edit rulesets, so the agent's fallback keeps the custom domain and deploys a redirect-only `next-session` Worker that 301s every path and query to `little-spaniel-709.convex.site`, then curls the apex to confirm. The next deploy from `main` replaces that Worker, so hold merges until the rule is back. Two things look like a rollback and are not: removing `routes` from `wrangler.jsonc` does not detach the domain, and deleting the custom domain to restore the apex `CNAME → convex.domains` without the redirect rule takes the apex down, because Convex answers the apex Host with a 403 ([ADR-0001](adr/0001-spa-on-cloudflare-workers-backend-on-convex-free.md)). While rolled back, point the deploy smoke's `APP_URL` in `ci.yml` at `https://next-session.silthus.workers.dev`, or every deploy fails its smoke.

Old links ([ADR-0005](adr/0005-legacy-share-links-redirect-to-lonir.md)): the Worker runs first only on `/s/*` and `/groups*` (`assets.run_worker_first`), so static requests stay free and unmetered.

## 10. Proof in production

`e2e/production.spec.ts`, run with `BASE_URL=https://next-session.link bun run e2e:prod`:

1. Landing → **Create your link** → the Share Link shows in place.
2. Open the Group, rename it.
3. A second browser context opens the Share Link, joins as a new Player, answers free on two bookable dates and maybe on one.
4. The GM sees the Player's bars, selects a free date, schedules a Session; the Player context shows it.
5. The GM saves the Group with a fresh email and password. A third context logs in with them and sees the Group with the same Share Link.
6. `GET /s/AAAAAAAA` answers 302 to Lonir.
7. My groups (§12.8): the Player context logs in to the same Account and taps **Keep this group**. **My groups** in the account menu opens `/me`, which shows the Session under Next sessions and the Group under both "You play in" and "You run". **Remove from my groups** releases the claim, and Undo claims the Player again. The run creates no second Account.
8. The GM deletes the Group (test data cleanup), and the Player context sees the link gone. An Account without Groups then lands on `/me`. The `afterEach` deletes the Group too when an earlier step failed.

Evidence goes on the proof ticket: the run log, the Playwright HTML report summary, and screenshots. The account stays; deleting Accounts is not a v1 feature (Surfaced).

## 11. Build plan

The tickets are children of map #1, each one reviewable PR. UI-facing tickets are cast to Fable 5.1.

| # | Ticket | Blocked by | Write scope |
| --- | --- | --- | --- |
| 1 | Scaffold: toolchain, app shell, check gate, CI gate, e2e harness | — | root configs, `.github/workflows/ci.yml`, `src/main.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `convex/schema.ts` (empty), `e2e/smoke.spec.ts` |
| 2 | Domain core in `shared/` | 1 | `shared/**` |
| 3 | Backend: schema, access, groups, Share Links, rate limits | 2 | `convex/schema.ts`, `convex/model/**`, `convex/groups.ts`, `convex/convex.config.ts` |
| 4 | Backend: roster, Sessions, month schedule | 3 | `convex/roster.ts`, `convex/schedule.ts`, `convex/sessions.ts` |
| 5 | Backend: player surface | 3 | `convex/player.ts` |
| 6 | Auth: Create your link, Password, Save, Expiry | 3 | `convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts`, `convex/account.ts`, `convex/crons.ts`, `convex/cleanup.ts`, `src/features/account/save.ts`, `src/features/account/useGm.ts`, `src/main.tsx`, `scripts/auth-env.ts` (plus one hook line in the e2e backend script) |
| 7 | Deploy from `main` to Workers and Convex prod | 1 | `wrangler.jsonc`, `worker/**`, the deploy job in `.github/workflows/ci.yml`, repo secrets and variables |
| 8 | UI: design system, app shell, legal pages | 1 | `src/ui/**`, `src/index.css`, `src/routes/__root.tsx`, legal and not-found routes, `src/features/legal/**`, `src/lib/**` |
| 9 | UI: landing, Create your link, Save and Log in sheet | 6, 8 | `src/routes/index.tsx`, `src/features/landing/**`, `src/features/account/*.tsx`, `e2e/landing.spec.ts` |
| 10 | UI: GM calendar and scheduling | 4, 6, 8 | `src/routes/g.$groupId.tsx`, `src/features/group/GroupScreen.tsx`, `src/features/group/calendar/**`, `e2e/gm-calendar.spec.ts` |
| 11 | UI: GM rail (Share Link, switcher, Roster, Best Nights, Sessions, nudge) | 10 | `src/features/group/rail/**`, `e2e/gm-rail.spec.ts` |
| 12 | UI: player surface | 5, 8 | `src/routes/s.$shareToken.tsx`, `src/features/player/**`, `e2e/player.spec.ts` |
| 13 | Cutover of `next-session.link` | 7, 9, 11, 12 | `wrangler.jsonc` routes, zone DNS |
| 14 | Prove it in production | 13 | `e2e/production.spec.ts`, `package.json` script `e2e:prod` |

Parallel lanes after the scaffold: {2 → 3 → 4, 5, 6}, {7}, {8}. Tickets 9 to 12 start once their backend and the design system land.

## 12. Player Accounts and My groups

Status: accepted (self-accepted under the map's autonomy note, 2026-10-06). Resolves [#57](https://github.com/Silthus/next-session/issues/57). Decision record: [ADR-0010](adr/0010-accounts-claim-players-share-token-still-answers.md).

Michael on 2026-10-06: Players can create an Account too, see all their Groups, and update their answers. A Player invited to several Groups sees each Group's Sessions. Email comes later. A Player who joins with a new name stays on the Roster until the GM removes them. The no-account path stays as smooth as today.

### 12.1 Calls

Each call is a reversible default. Michael can redirect any of them in one line.

| # | Call | Alternative |
| --- | --- | --- |
| 1 | One Account type with two roles: it owns Groups as a GM and claims Players | A separate Player account type |
| 2 | The link is an optional `players.userId` (a Claimed Player), indexed `by_userId_and_groupId` | A `claims` table, needed only if one Player could belong to several Accounts |
| 3 | Joining while signed in claims the new Player. Answering or Fill the rest claims a picked name; viewing and picking alone claim nothing (#96, 2026-10-07) | Require a separate Keep tap after answering |
| 4 | A claim does not lock answering: the Share Link still answers as any Player (ADR-0004 stands) | Claimed Players answer only through their Account |
| 5 | One Claimed Player per Account per Group; claiming another Player there moves the claim | Several per Group, for a parent who answers for two kids |
| 6 | Claiming another Account's Player throws `PLAYER_CLAIMED`; the GM removes a squatter | A GM "release claim" action on the Roster |
| 7 | Only Accounts claim. **Keep this group** from an Anonymous GM's browser runs Save first, then claims | Let Anonymous GMs claim and move their claims on Save |
| 8 | **Not you?** on a Claimed Player releases the claim | **Not you?** switches only on this device and keeps the claim |
| 9 | Players never leave a Group. **Remove from my groups** releases the claim; only the GM removes a Player (Michael's rule) | A Player can delete themselves |
| 10 | Rotating the Share Token keeps Claimed Players in: My groups returns the current token | Rotation releases every claim of the Group |
| 11 | My groups lists Groups and Sessions; answering stays on `/s/<token>`. After the first saved answer, visitors see a dismissible Keep card with Create account first and Google when available (#96, 2026-10-07). A visitor who finishes the month sees the Keep your sessions card in place of the done card, which asks again with the calendar invite (#127, 2026-10-16) | An inline multi-Group calendar, or a quiet Keep line that Players miss |
| 12 | The landing sends an Account without Groups of its own to `/me`. A GM still lands on their last Group, with a **My groups** link in the header | Every Account lands on `/me` |
| 13 | A Player's name stays per Group. There is no Account display name | An Account name prefilled into Join |
| 14 | The Privacy Policy gains one row and becomes 1.2. No re-acceptance gate: the new processing happens only when someone keeps a Group, and creating the Account stamps 1.2 | Build the re-acceptance gate first |
| 15 | Session emails use disabled PostHog Workflows (§12.6); #102 owns activation | Build Resend sending now |

### 12.2 Who sees what

| Caller | On `/s/<token>` | On `/me` |
| --- | --- | --- |
| Visitor without a session | Today's flow: pick or type a name, tap days. A **Log in** link in the header and a quiet **Keep this group** line under the calendar | Redirected to `/` |
| Anonymous GM | Today's flow. **Keep this group** runs Save, then claims | Redirected to their Group |
| Account | Opens as the Claimed Player when it has one in this Group, on any device; otherwise Join, where a new name is claimed at once | Their Groups and Sessions |

### 12.3 Backend

Schema: `players.userId` and `by_userId_and_groupId` (§3), plus `groupRemovals {userId, groupId}` indexed by `by_userId_and_groupId` and `by_groupId`. The Player field is optional and the new table starts empty, so existing rows need no migration. Invariant 9 in §3 holds the rules.

- `currentAccount(ctx)` and `requireAccount(ctx)` in `convex/model/access.ts` return the signed-in user only when it is not anonymous.
- `claimedPlayerIn(ctx, accountId, groupId)` and `claimPlayer(ctx, account, player)` in `convex/model/players.ts`. `claimPlayer` is a no-op when the Account already holds the Player, throws `PLAYER_CLAIMED` when another Account does, and throws `TOO_MANY_GROUPS` at the 50th claim unless it moves a claim within the Group. Otherwise it clears the Account's earlier claim in the Group and sets `userId`.
- `player.group` returns `claimedPlayerId` and the caller's `removedFromMyGroups` opt-out, read through the Account/Group indexes. Visitors and Anonymous GMs get `null` and `false`. The opt-out keeps explicit Keep available after reload, even when the Player has no saved answers. It also returns `calendarInvites`: `"on"` when Session mail's send-time rules (§15) would mail the caller a calendar invite for this Group now, `"off"` when they would but for the caller's Session emails switch, and `null` otherwise, including on a deployment without `RESEND_API_KEY`. `calendarInvitesIn` in `convex/sessionMail.ts` answers it with `calendarInviteeIn`, the check every calendar send makes, so the page and the mail can't disagree.
- `player.join` inserts the Player, then calls `claimPlayer` when the caller is an Account. A refused claim refuses the whole join, so a Player is never inserted half-done.
- `player.answer` and `player.fillRest` auto-claim an unclaimed Player for an Account, including a GM answering their own link. A new claim moves the Account's previous claim in the Group. They return `{keptNow}` for the confirmation toast. Another Account's claim, the 50 Group cap, or a deliberate removal leaves the answer saved and the claim unchanged; an explicit Keep still reports `PLAYER_CLAIMED` or `TOO_MANY_GROUPS`. The Share Token remains the answer credential.
- `player.removeFromMyGroups({groupId})` releases the caller's claim and remembers the Account's opt-out in `groupRemovals`. Answering as any Player in this Group no longer auto-claims. Undo or explicit Keep removes the opt-out; joining with a new name also removes it. A deliberate Remove also cancels the matching pending Keep, so reload cannot undo the opt-out. Other Accounts' opt-outs survive. Removing a Player does not erase the Group opt-out; deleting the Group cleans it up in the same bounded child-deletion process.
- `player.claim({shareToken, playerId})` checks the Player against the token with `playerOnShareLink`, then calls `claimPlayer`. `player.release({groupId})` clears the caller's claim in that Group and returns `null` whether one existed or not, so it cannot probe Groups.
- `me.groups({today})` returns `null` for anyone but an Account, else:

```ts
type MyGroups = {
  running: { groupId: Id<"groups">; name: string; upcomingSessions: DatedSession[] }[];
  playing: {
    groupId: Id<"groups">;
    name: string;
    shareToken: string;
    playerId: Id<"players">;
    playerName: string;
    upcomingSessions: DatedSession[];
    openDates: number;
  }[];
};

type DatedSession = { date: IsoDate; state: "scheduled" | "cancelled" };
```

`today` is the client's UTC date from `useTodayUtc`, so the subscription reruns at midnight even when nothing is written; a Session that just passed drops out and `openDates` shrinks without a database change. The server accepts `today` only within one day of its own UTC date and otherwise uses its own, so a wrong clock cannot widen the Booking Window. A test changes `today` across midnight with no write in between and sees both values move.

`upcomingSessions` are the first five Sessions from `today` on, read as an index range on `by_groupId_and_date`. A Cancelled Session counts toward the five and drops out once `today` passes its date. `openDates` is the number of bookable dates from `today` to the end of the Booking Window minus the Claimed Player's Answers in that range, read on `by_playerId_and_date`. A Group the Account runs and plays in shows in both lists. A claim whose Group was deleted while `groups.deleteChildren` is still running is skipped.

Every read is bounded. Running Groups come from `by_ownerId` with `.take(50)`; invariant 7 holds that cap, now also on Save (§5.3). Playing Groups come from `by_userId_and_groupId` with `.take(50)`, the claim cap. Per running Group: the Group and at most 5 Sessions. Per playing Group: the Group, the Player, at most 5 Sessions, and at most 92 Answers. The worst case is 50 × 6 + 50 × 99, about 5,300 documents, inside Convex's per-query read limits. An Account already above 50 Groups from a Save before this change sees its oldest 50 here; the GM surface still lists them all.

Unchanged: `roster.removePlayer` deletes the Player with its Answers, so the claim goes with the row; `groups.remove` and Expiry delete Players in batches the same way. Deleting an Account stays out of v1.

### 12.4 Player page

- **Header.** A small account control: **Log in** for a visitor, the email with **Log out** and **My groups** for an Account, nothing new for an Anonymous GM.
- **Auto-open.** When `claimedPlayerId` is set, the page skips Join, opens the calendar as that Player, and writes it to `next-session.players`.
- **Keep this group.** After the first saved answer, a signed-out visitor sees a card under the calendar: "Keep this group", then "Get a calendar invite for every session." and "Find it and your answers on all your devices." **Create account** opens the existing Account sheet, with **Create account** first and **Log in** second. **Continue with Google** appears when enabled, with its legal line. **Not now** dismisses the card for this visit and leaves the quiet line "**Keep this group** to get calendar invites." The card never blocks answering.
  - **Keep your sessions.** When a visitor who hasn't dismissed the card finishes the month, the green done card becomes one accent card, a `status` region: "✓ All set for October. Your GM sees it." ("✓ All set for now. Your GM sees it." on the last bookable month), the heading "Keep your sessions and get a calendar invite", "Every session lands in your calendar.", **Create account**, **Continue with Google** with its legal line when enabled, and the ghost button "Not now, fill November →" ("Not now" on the last bookable month). The Keep card is hidden while it shows. Its keep buttons start the same keep as the Keep card, with the same sheet, Google redirect, pending keep and refusals. **Not now** dismisses the Keep card for this visit and lands on the next month in one tap; on the last bookable month it only dismisses, and the green "All set" card takes focus. After Not now, a finished month shows the green card. When Fill Rest finishes the month, focus moves to the card's first line, as it does for the green card. The promise leaves out "and moves when your GM moves it" until a Gmail entry added with one tap has been seen to move (#166).
  - The quiet line reads "**Keep this group** to get calendar invites." wherever it shows: after Not now, for an Account that removed the Group, and for an Anonymous GM. An Account and an Anonymous GM see the green done card.
  - An Account is kept automatically on Join or a saved answer or Fill the rest. The page shows "Kept in My groups" with **Remove from my groups** beside it. When `calendarInvites` is `"on"`, a second line reads "Calendar invites go to <the email the header shows>."; when it is `"off"`, "Calendar invites are off. Turn them on in My groups.", with My groups linking to `/me`. Remove confirms with an **Undo** toast. Explicit **Keep this group** remains available after Remove or an automatic claim that could not succeed.
  - A visitor signs in through the nudge, then the existing keep path claims at once.
  - An Anonymous GM keeps the quiet line and Save-first sheet (§5.3), then claims.
  - The client writes `next-session.pendingKeep` (`{shareToken, playerId}`) to `sessionStorage` before signing in and clears it after the claim. It also clears it on `PLAYER_CLAIMED`, `NOT_FOUND`, `TOO_MANY_GROUPS`, a sign-in the server refused, and **Not you?**. App start retries a leftover keep once an Account is signed in, which covers a dropped connection and Google's OAuth redirect (#58) alike.
- **Next sessions.** While a scheduled Session lies ahead, the page opens with one row per upcoming scheduled Session and, under them, **Add to calendar**: a plain link to the Calendar download `/cal/s/<Share Token>.ics` (§14.1), so phones open their calendar import. The line beside it reads "A one-time copy. Keep this group to get moves and cancellations too." An Account that keeps the Group reads "A one-time copy. Subscribe on My groups to follow moves and cancellations." instead, with the link to `/me`. When `calendarInvites` is `"on"`, a **✓ Invite sent** chip replaces the download and its line; it says "sent", not "in your calendar", because Gmail at "known senders only" needs one tap. The rows read the live Sessions and the file reads `published`, so a night scheduled within the last 30 seconds shows in the rows before it is in the file.
- **Join while signed in** claims the new name and confirms with a toast: "Kept in My groups".
- **Not you?** on a Claimed Player calls `player.release`, then shows Join.
- **`PLAYER_CLAIMED`** reads "Another account keeps this name. Add yours with a last initial, or ask your GM."

The no-account path keeps its steps and its fields: Join shows no new prompt, and nothing asks for an Account before the first answer.

### 12.5 My groups (`/me`)

- **Next sessions** on top: every upcoming Session across both lists, merged by date, each with its Group name, the next five shown. A scheduled one shows its time range in its Group's wall clock, the zone named only when the browser's differs, and its place when it has one.
- **You play in:** a card per Claimed Player with the Group name, the Player name, the next Session, and "N days to answer" while `openDates > 0`. The card opens `/s/<token>`, which opens as the Claimed Player. A menu offers **Remove from my groups**, with Undo through `player.claim`.
- **You run:** a card per Group with its next Session, opening `/g/<groupId>`.
- **Empty:** "Open your GM's link and tap Keep this group", plus Create your link.
- **Log out** in the header. The GM surface's header gains a **My groups** link for Accounts.

### 12.6 Session emails through PostHog Workflows

> Superseded by §15 once `RESEND_API_KEY` is set. Until then this path runs unchanged.

Michael chose Workflows on 2026-10-07; Resend from Convex was the alternative. Implementation (#97) shipped disabled. #102 owns sender verification, the transactional "Session updates" category, activation, mail environment and inbox proof. The visitor nudge promises notifications only after #102.

- Session updates follow the published snapshot ([ADR-0013](adr/0013-sessions-publish-a-snapshot-after-the-undo-window.md)). `sessions.schedule` and `sessions.cancel` change the Session through `convex/sessionLifecycle.ts`, which sets `changedAt` and schedules `internal.sessionLifecycle.settle` 30 seconds and 1 ms later. The GM never waits for a webhook.
- `sessions.updateDetails` goes through `updateSessionDetails`, which writes the Session's own values, bumps `changedAt` and queues a settle, so a burst of edits publishes once after the Undo window. A Session keeps its own values through cancel and **Schedule again**.
- `groups.updateSettings` and `groups.rename` go through `groupChanged`, which bumps `changedAt` and queues a settle for every **scheduled** Session in the Booking Window. A Cancelled Session keeps its published time until **Schedule again**, and a past Session is never touched.
- `settle` does nothing when the Session is gone or has changed since. Otherwise it builds the snapshot the Session means now: its state, its start and end from `sessionWindow` in the Group's time zone with the Session's own start time and length, the Session's own location else the Group's, and the Group name. A `published` from before Time and place counts as that usual 19:00 for 4 hours in Europe/Berlin with no place. When the snapshot differs from `published`, it writes `published` with the next revision and calls `sessionPublished` in `convex/sessionMail.ts`. A publish that leaves the state as it was, such as a Group's new start time, sends no Session update, because the update can only say set or cancelled. So a cancel inside the first Undo window, which deletes the Session, sends nothing; Undo of a cancel sends nothing; and a burst of changes sends only its final state, once. `change` is the published state: `scheduled` for a first publish or a Schedule again, `cancelled` for a cancel. `settle` publishes whether or not mail is configured. With either `POSTHOG_SESSION_WEBHOOK_URL` or `POSTHOG_MAIL_WEBHOOK_SECRET` missing, no send is queued.
- Recipients are the current Accounts behind the Group's Claimed Players, read through indexed queries and deduplicated by Account. Exclude the Group's owner, who made the change, Anonymous GMs, missing emails, `.test` addresses and opted-out Accounts. Each send carries the state it announces and drops itself when the published state has changed, the Session or Group is gone, the Account no longer claims a Player in the Group, or Session emails are off. Read the email, Group name and current Share Token at each send attempt. Cancellation uses the current Share Link, never a deleted Session URL.
- One secret-guarded webhook per eligible Account, through the existing action retrier: at most four attempts for network failures and 5xx; 4xx, including 429, log refusal without retry. The webhook carries `{distinct_id, product, email, group_name, date_label, change, player_url}` as workflow trigger data only. Personal mail data stays out of application usage events and person properties. Provider operational delivery records may contain recipient email and subject metadata. A timeout after acceptance can still duplicate a mail, as with Welcome Mail.
- `/me` stores `users.sessionEmailsEnabled`, defaulting to true when absent. Only the authenticated Account can change its own preference. It applies to all Groups. Session updates are transactional. PostHog omits transactional categories from hosted preferences and does not apply category unsubscribe; the authenticated switch is the Session email opt-out. Tips consent and its hosted unsubscribe are separate.
- Daily volume is an estimate of planned Next Session deliveries requested in a UTC day across all Groups and mail kinds: Welcome = 1, Tips = 2, Session update = 1. Warn through `serverLog` when the count first reaches 80 and first exceeds tier 0's 100. Count no suppressed recipients and no retry twice; never drop a fan-out at the threshold. Rows expire after two days. This estimate includes future Tips conservatively but cannot know when those delayed sends happen, whether they exit early, provider suppression, accepted retries or Lonir's other mail. #102 must check the shared project's actual sending usage and queuing before activation.

### 12.7 Legal

`docs/legal/privacy.md` gains one row in the data table: "For a player with an account: which player in which group belongs to your account, to show your groups on any device", and `LEGAL_VERSIONS.privacy` becomes `"1.2"` (1.1 added Google sign-in, §5.7) with a new effective date. The Terms already say Players need no account and need no change.

### 12.8 Test seams

| Seam | Tested through |
| --- | --- |
| `player.join`, `player.answer`, `player.fillRest`, `player.claim`, `player.release`, `player.removeFromMyGroups`, `player.group`, `me.groups`, `account.finishSave` | `convex-test` through `api.*` with `t.withIdentity` for an Account and an Anonymous GM. Invariant 9 and every row of §12.2 has a test, including: a joined Player stays until `roster.removePlayer`; release keeps the Player and its Answers; a removed Player leaves My groups; a rotated token still shows in My groups; `today` moving across midnight without a write changes `upcomingSessions` and `openDates`; a Save past 50 Groups moves nothing |
| `src/features/account/keep.ts` | Vitest with fake `deps`, as `save.ts` |
| `Join`, `PlayerCalendar`, `KeepGroup`, `PlayerScreen`, `MyGroups` views | Testing Library: props in, callbacks out; PlayerScreen consumes fake Convex subscriptions and Account actions |
| The whole flow | Playwright on the local backend: a visitor answers, keeps the Group by creating an Account, joins a second Group's link while signed in, sees both Groups and a scheduled Session on `/me`, and a second browser context logging in opens the first Group as the same Player. The production spec gains this as step 8 |

### 12.9 Build plan

| # | Ticket | Blocked by | Write scope |
| --- | --- | --- | --- |
| A | Backend: Claimed Players and My groups | — | `convex/schema.ts`, `convex/player.ts`, `convex/me.ts`, `convex/account.ts`, `convex/model/**`, `shared/limits.ts`, their tests, `src/lib/errors.ts` |
| B | UI: Keep this group on the player page | A | `src/features/player/**`, `src/features/account/**`, `src/lib/**`, `docs/legal/privacy.md`, `shared/legal.ts`, `e2e/player-account.spec.ts` |
| C | UI: My groups at `/me` | A, B, and the Roster ticket #56 (shared `src/features/group/**`) | `src/routes/me.tsx`, `src/features/me/**`, `src/features/landing/Landing.tsx`, the header of `src/features/group/GroupScreen.tsx`, the account control in `src/features/player/**`, `e2e/my-groups.spec.ts`, step 8 of `e2e/production.spec.ts` |

Google sign-in (#58) also edits `src/features/account/**`. Whichever of #58 and ticket B lands second rebases onto the other; neither blocks the other, because #58 parks on Michael's OAuth client.

## 13. Observability and lifecycle mail with PostHog

Status: accepted (self-accepted under the map's autonomy note, 2026-10-06). Resolves [#70](https://github.com/Silthus/next-session/issues/70). Decision record: [ADR-0011](adr/0011-posthog-cookieless-analytics-and-workflows-mail.md).

Michael on 2026-10-06: "Instrument the whole app with PostHog analytics, error tracking, logging, and tracing, using OTEL and the new endpoint (the full shenanigans). Check if we can use PostHog workflows to set up a welcome mail and [drip] campaign."

Sources, read on 2026-10-06: PostHog docs for [Logs](https://posthog.com/docs/logs/installation/other), [JavaScript web logs](https://posthog.com/docs/logs/installation/javascript), [distributed tracing](https://posthog.com/docs/distributed-tracing/start-here), [cookieless tracking](https://posthog.com/docs/privacy/data-collection#cookieless-tracking), [IP data capture](https://posthog.com/docs/privacy/data-collection#ip-data-capture), [Vite source maps](https://posthog.com/docs/error-tracking/upload-source-maps/vite), [Workflows channels](https://posthog.com/docs/workflows/configure-channels), [opt-outs](https://posthog.com/docs/workflows/opt-outs), [sending reputation](https://posthog.com/docs/workflows/sending-reputation) and the [Cloudflare proxy](https://posthog.com/docs/advanced/proxy/cloudflare); Convex [runtimes](https://docs.convex.dev/functions/runtimes), [log streams](https://docs.convex.dev/production/integrations/log-streams), [exception reporting](https://docs.convex.dev/production/integrations/exception-reporting) and [pricing](https://www.convex.dev/pricing); Cloudflare [OpenTelemetry export to PostHog](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/posthog/). Lonir's own PostHog setup (`Omni-GM/lonir`: ADR-0004, `docs/agents/observability.md`, `convex/lib/posthogEvents.ts`, `convex/posthogProxy.ts`) shaped the shared-project rules.

### 13.1 What is feasible, and what is not

| Signal | Where it can come from | Verdict |
| --- | --- | --- |
| Product analytics | `posthog-js` in the SPA; PostHog's capture API from a Convex action | Built. Queries and mutations cannot call `fetch`; a mutation schedules an internal action that sends |
| Error tracking, browser | `posthog-js` exception autocapture, React's root error callbacks, the router's error component | Built, with source maps uploaded by the deploy job |
| Error tracking, Convex functions | Convex exception reporting has a PostHog Error Tracking integration | **Not on Convex Free.** Exception reporting is Pro only ($25 per developer per month). Until then the browser reports the unexpected Convex errors it receives, with the function name and Convex's request ID, and the full server error stays in the Convex dashboard |
| Logs, browser | `posthog.logger` (`posthog-js` 1.368+), which ships OTLP log records to PostHog Logs | Built for a few named events, not `console.*` |
| Logs, Convex | Convex log streams have a native PostHog destination over OTLP | **Not on Convex Free.** Log streams are Pro only. A Convex action can still `POST` OTLP/JSON log records to `/i/v1/logs` with `fetch`, no SDK needed. Used for the server facts the browser never sees (the Expiry sweep) |
| Logs, Cloudflare Worker | Workers Logs export over OTLP to `/i/v1/logs` | Possible, not built: the Worker only redirects legacy links and proxies `/ingest` (§13.4), so its logs would be noise |
| Traces | PostHog accepts OTLP spans at `/i/v1/traces` | **Not feasible end to end.** Convex emits no spans on any plan, and calls travel over one WebSocket with no per-call headers, so a W3C `traceparent` cannot reach a function. `posthog-js` has no span exporter. Cloudflare's PostHog guide says Workers Traces do not export to PostHog. An OTEL SDK fits only a `"use node"` action, and this app has none worth tracing |

So: OTLP is used where it runs (PostHog Logs from the browser and from Convex actions). No OTEL SDK goes into Convex: the default runtime cannot hold an exporter across calls, and Node actions would add a cold start to every telemetry send for no span worth having. The upgrade path is one switch: on Convex Pro, turn on the PostHog log stream and PostHog exception reporting in the Convex dashboard, and they cover every function's logs and errors with no code change.

### 13.2 Calls

Each call is a reversible default unless marked as Michael's. He can redirect any of them in one line.

| # | Call | Alternative |
| --- | --- | --- |
| 1 | **Michael's call (2026-10-06): share Lonir's PostHog project** on EU Cloud. Region EU was settled by the token: it authenticates on `eu.i.posthog.com` | A dedicated Next Session project. The switch is one config value per surface (§13.9) |
| 2 | Every event, exception and log carries the Product Marker `product: "next-session"`; logs carry `service.name` `next-session-web` or `next-session-convex`. Event names use PostHog's `category:object_action` shape with the category `next_session`, so no Lonir insight or workflow that matches by name (`session_scheduled`, `sign_in_started`) ever sees ours | Lonir's names plus the marker, which continues Lonir's `session_scheduled` activation insight but leaks into every Lonir insight that does not filter |
| 3 | Next Session reads no feature flag: `advanced_disable_flags: true` in the browser, and the server never evaluates flags | Read flags for rollouts later, under a `next-session-` key prefix |
| 4 | Browser analytics run in `cookieless_mode: "always"` with `person_profiles: "never"`: no cookie, no `localStorage`, no person in the browser, so no consent banner. The analysis is in §13.3 | A consent banner with `cookieless_mode: "on_reject"`, the way Lonir does it. One init option plus a banner component |
| 5 | The core loop is measured from the server: committed facts (link created, Player joined, Session scheduled) are captured by Convex, where ad blockers cannot drop them and the numbers match the database | Capture everything in the browser, which is simpler but lossy |
| 6 | An Account is identified as `next-session:<users._id>`. Its email reaches PostHog only inside a mail request (§13.6), never as a person property. Persons are never joined with Lonir by email | Identify by email to see one person across Lonir and Next Session. That combines data across two products, which the Privacy Policy would have to disclose and justify |
| 7 | Anonymous GMs and Players without an Account get no person profile (`$process_person_profile: false`); their events carry `group_id` instead | Person profiles for everyone, which costs more and keeps more |
| 8 | No session replay and no autocapture. Replay needs consent under German law, and autocapture would send Player names, which are the text of the buttons | Replay with masking behind the banner of call 4 |
| 9 | Group analytics stays off; events carry `group_id` as a plain property | A `next_session_group` group type, which needs the paid add-on and one of the shared project's five group-type slots |
| 10 | Browser traffic goes through the Worker at `next-session.link/ingest`, the PostHog Cloudflare proxy pattern | Send straight to `eu.i.posthog.com`, which ad blockers drop |
| 11 | Everything ships disabled: the browser initialises PostHog only when the build has `VITE_POSTHOG_TOKEN`, and Convex sends only when the deployment has `POSTHOG_PROJECT_TOKEN`. Only the production deploy sets them, so dev, CI, e2e and the local backend send nothing | A runtime kill switch through a flag, which would contradict call 3 |
| 12 | PostHog Workflows sends the mail. It can: a webhook trigger guarded by a secret `Authorization` header, delays up to 30 days per step, email steps, message categories with a hosted unsubscribe page, and a verified sender domain. Only Convex starts a mail workflow: the project token is public, so a workflow triggered by a captured event would mail any address anyone posts | Resend from Convex scheduled functions, the §12.6 hook. Replaced for Session updates by Michael's 2026-10-07 Workflows call (§13.7) |
| 13 | Every new Account gets one **Welcome Mail** (transactional, no promotion) | No mail at all until notifications ship |
| 14 | The drip is **Tips**: two mails, only for Accounts that tick an unticked box in the Save sheet and then press **Yes, send me the tips** on the page the Welcome Mail links to (double opt-in). Opening the link alone confirms nothing, so a mail scanner cannot subscribe anyone | Single opt-in, or treat the tips as service messages without consent. German law (§ 7 UWG) reads usage tips as advertising, and double opt-in is how consent is proven |
| 15 | Email open and click tracking are off on every step (`tracking_enabled: false`) | Turn them on, which puts a tracking pixel in a mail and needs consent of its own |
| 16 | Test Accounts never get mail: Convex requests no mail for a `.test` address, their events carry `is_test_account: true`, and the production spec signs up with `@example.test` instead of `@next-session.link` (whose mail would bounce and cost sender reputation) | Rely on the project's test-account filter, which Lonir owns |
| 18 | Mail requests are durable: Convex sends them through `@convex-dev/action-retrier`, which retries network errors and 5xx answers with backoff. Analytics events stay best-effort and are dropped on failure | Retry analytics too, which costs function calls for numbers nobody misses |
| 19 | An objection is enforced, not just promised: `users.analyticsObjectedAt` stops every server event for that Account, and `/privacy` gets **Turn off usage measurement in this browser**, which sets Next Session's own opt-out flag (§13.4) | Promise objection by email and handle it by hand in PostHog, where deleted persons come back with the next event |
| 17 | The Privacy Policy gains the analytics, error and mail sections and bumps its minor version. No re-acceptance gate: analytics run on legitimate interest, and Tips need their own consent anyway | Build the re-acceptance gate first (§6.3) |

### 13.3 Consent and privacy

The operator is in Germany, so two laws apply: § 25 TDDDG for anything read from or stored on the device, and the GDPR for every personal datum.

- **No device storage, minimal device reads.** `cookieless_mode: "always"` never writes PostHog state to a cookie, `localStorage` or `sessionStorage`. § 25 TDDDG also covers reading from the device, so `before_send` drops what the SDK reads through JavaScript beyond what every HTTP request already carries: `$screen_height`, `$screen_width`, `$viewport_height`, `$viewport_width`, `$timezone`, `$timezone_offset`, `$browser_language` and `$browser_language_prefix` (and their `$initial_*` twins). It also drops `title`, because a Player page's title carries the Group name, and `ph_keyword`, the query of a search-engine referrer. Init turns off campaign parameters (`save_campaign_params: false`, so no `utm_*` or click IDs) and scroll properties, and keeps PostHog's state in memory only. What remains is the URL, the referrer and what PostHog derives from the user agent. At init `posthog-js` still probes `localStorage` (it writes and removes `__mplssupport__`) and reads its own opt-out and debug keys; nothing stays, and a test pins that. PostHog counts unique visitors with a daily-salted server-side hash of IP and user agent, which it does not store. Michael enables "Cookieless server hash mode" in the shared project's web analytics settings once; it changes nothing for Lonir's SDK, which does not use cookieless mode.
- **Legal basis.** Pseudonymous, first-party product analytics and error reports on legitimate interest (Art. 6(1)(f) GDPR): keep the Service working and find out which steps people use. No cross-site tracking, no profiling across products (call 6), no advertising, and an objection stops it: the button on `/privacy` for the browser, and `users.analyticsObjectedAt` (set on an emailed objection) for an Account's server events.
- **IP addresses.** The project's "IP data capture" setting must read "discard". EU organizations default to it; the switch-on ticket checks it and asks Michael before changing a setting Lonir shares.
- **Only our events leave.** `before_send` passes `$pageview`, `$exception` and `next_session:*` and drops every other event the SDK would capture.
- **What the browser never sends.** `before_send` (events) and `logs.beforeSend` (log records, which carry `url.full` on their own pipeline) pass every string value that is a URL or a path on the app's origin through one pure function, `redactUrl`, so `$current_url`, `$pathname`, `$referrer`, `$session_entry_url`, `$initial_*` and `url.full` are all covered without a list to keep current: a Share Token path becomes `/s/:shareToken`, and the query keeps only `month` and `day`. That also drops the OAuth `code` (#58) and the Tips `confirm` code, which the exception scrubber also removes by name. Autocapture is off, so no element text (Player and Group names) leaves the page. Exception messages from our code carry codes, not names, and an unexpected Convex error is reported as a new `ConvexServerError` with the function name and request ID only, never the server's message. No `track` property and no log attribute carries a Player name, Group name, Share Token, claim code or email.
- **This is an assessment, not a settled answer.** The EDPB's Guidelines 2/2023 read Art. 5(3) ePrivacy broadly enough that a script sending any device data to a third party may need consent even without storage, and German authorities have not ruled on cookieless analytics. The minimization above lowers the risk; it does not remove it. So browser measurement switches on only after Michael, as the controller, accepts this position in the switch-on ticket (#79), or picks call 4's alternative: one init option and a banner component. Server-side events and mail do not read the device and do not wait on that decision. The drafts already await a lawyer (§7). Lonir chose a banner; Next Session's one-click landing is the reason to try without one.
- **Email.** The Welcome Mail goes to an Account's own address as part of the contract (Art. 6(1)(b)). Tips go only after consent (Art. 6(1)(a), § 7(2) UWG), proven by double opt-in: the tick, then the press of **Yes, send me the tips** on the page linked from the mail sent to that address. `users` keeps both timestamps and the version of the box's wording. Withdrawal is PostHog's hosted unsubscribe page, linked in every Tip, or a reply.

#### What changes in the Privacy Policy

`docs/legal/privacy.md`:

- §2 gains rows: "Pseudonymous usage events (pages viewed, steps such as creating a link, joining, scheduling), with your account ID for an account | Learn which parts of the Service are used, fix problems | Legitimate interest, 6(1)(f)"; "Error reports and technical logs (error message, browser, page) | Keep the Service working | Legitimate interest, 6(1)(f)"; "For an account: your email address, to send the welcome mail | Contract, 6(1)(b)"; "If you ask for tips: your email address and your confirmation | Send the two tip mails | Consent, 6(1)(a)".
- The sentence "We do not use analytics, advertising, or tracking" becomes: "We measure use without cookies and without storing anything on your device. We do not use advertising or cross-site tracking, and we do not sell data."
- §3 states that the usage measurement stores nothing on the device, so the list stays complete and the Service still sets no cookies.
- §4 gains the processor row: "PostHog Inc. | Usage measurement, error reports, logs, and sending the account emails | EU (Frankfurt) hosting, US company".
- §5 gains: usage events and error reports for the event retention of the PostHog plan (#77 reads it from the billing page and writes the number); logs 14 days; the email address in PostHog until the account is deleted.
- §6 names the objection right for usage measurement and the withdrawal of Tips consent.
- `LEGAL_VERSIONS.privacy` goes up one minor version past whatever has landed (Google sign-in took 1.1 and §12's row takes 1.2, so 1.3 if both land first) with a new effective date.

### 13.4 Browser

`src/lib/telemetry.ts` is the only module that imports `posthog-js`. Everything else calls it. It loads `posthog-js/dist/module.slim` lazily, with only the history pageview, error tracking and logs extensions, and only when the build has the token, so a build without it loads no PostHog code. `track`, `log` and `reportError` queue calls made while PostHog loads, and drop them when telemetry is off. posthog's bot detection means Playwright browsers never send, so the events are proven at the view seams with a fake `track` (§13.10).

```ts
// src/lib/telemetry.ts (interface)
export type BrowserEvent =
  | { name: "share_link_copied"; surface: "landing" | "rail" | "compact"; method: "clipboard" | "fallback" | "failed" }
  | { name: "share_link_shared"; surface: "landing" | "rail" | "compact"; channel: "whatsapp" | "telegram" | "mail" | "native" }
  | { name: "fill_rest_used"; group_id: string } // once the nights are saved
  | { name: "answers_started"; group_id: string } // once per page load and Group, at the first saved tap or Fill the rest
  | { name: "save_started" } // password or Google
  | { name: "sign_in_failed"; flow: "signUp" | "signIn"; code: string } // only the auth refusals: WEAK_PASSWORD, EMAIL_TAKEN, INVALID_CREDENTIALS, RATE_LIMITED
  | { name: "keep_group_started"; group_id: string; surface: "done_card" | "keep_card" | "keep_line" } // the tap on a keep button, and which one
  | { name: "remove_group_started"; group_id: string } // Remove from my groups on /me
  | { name: "remove_group_undone"; group_id: string } // its Undo
  | { name: "create_link_started"; surface: "me" } // Create your link on /me
  | { name: "calendar_downloaded"; group_id: string } // the press on Add to calendar
  | { name: "calendar_feed_copied"; method: "clipboard" | "fallback" | "failed" }; // Copy link of the Calendar feed on /me

export function initTelemetry(source?: EnvSource): Promise<void>; // no-op without VITE_POSTHOG_TOKEN
export function track(event: BrowserEvent): void; // sends `next_session:<name>`
export function log(level: "info" | "warn" | "error", body: string, attributes?: Record<string, string | number | boolean>): void;
export function reportError(error: unknown, context: { surface: string; convex_function?: string; convex_request_id?: string }): void;
export function redactUrl(url: string): string; // pure
```

The committed facts behind these steps (a link or Group created, a Player claimed or released) are captured by Convex (§13.5); the browser events add only what the server cannot see: the surface, the channel, and steps that end before a mutation. Where the events fire:

| Event | Call site |
| --- | --- |
| `share_link_copied`, `share_link_shared` | `ShareLinkCard` (`surface` is a prop: `landing` from the landing, else `compact` or `rail`). One event per Copy press with the final method; a native share counts once it resolves |
| `answers_started`, `fill_rest_used` | `PlayerCalendar`, which takes `groupId` |
| `keep_group_started` | `KeepGroup` (`keep_card` from the Keep card, `keep_line` from the quiet line) and the Keep your sessions card (`done_card`) |
| `calendar_downloaded` | `NextSessions` on the player page, one per press on **Add to calendar** |
| `save_started` | `saveGroups` and `saveThroughGoogle` in `save.ts` |
| `sign_in_failed` | The Account sheet's email form |
| `remove_group_started`, `remove_group_undone` | `useRemoval` on `/me` |
| `create_link_started` | `MyGroups`' Create your link |
| `calendar_feed_copied` | `YourCalendar`'s Copy link on `/me`, one event per press with the final method |

Init, called from `src/main.tsx` before the router renders:

```ts
posthog.init(token, {
  api_host: `${window.location.origin}/ingest`,
  ui_host: "https://eu.posthog.com",
  defaults: "2026-08-29", // strips URL fragments too
  cookieless_mode: "always",
  person_profiles: "never",
  autocapture: false,
  capture_pageview: "history_change",
  capture_pageleave: false,
  capture_exceptions: true,
  disable_session_recording: true,
  disable_surveys: true,
  disable_scroll_properties: true,
  save_campaign_params: false,
  persistence: "memory",
  advanced_disable_flags: true,
  logs: {
    serviceName: "next-session-web",
    environment: "production",
    serviceVersion: release,
    resourceAttributes: { product: "next-session" },
    beforeSend: redactLog, // redactUrl on every attribute; sets url.full itself, since the SDK adds it after this hook
  },
  before_send: redactEvent, // only our events; redactUrl on every URL-valued property; drops device reads (§13.3)
});
posthog.register({ product: "next-session" });
```

`release` is the commit SHA, passed as `VITE_RELEASE` by the deploy job, so exceptions, logs and source maps share a version. Pin `posthog-js` (1.438.1 today) like every other dependency.

- **Errors.** `capture_exceptions` covers uncaught errors and unhandled rejections. `createRoot` gets `onUncaughtError` and `onCaughtError`, which call `reportError` (one path; the root route's `errorComponent` only renders "Something broke. Reload the page."). `appErrorOf` in `src/lib/errors.ts`, which every error message and refusal goes through, reports a Convex failure only when it has no `ErrorCode`: expected codes like `RATE_LIMITED` are product flow, not errors. It reports each failure once, however often it is read, and only failures whose message starts with Convex's `[CONVEX M(<function>)]`. The report is a new `ConvexServerError` named after the function, with `convex_function` and `convex_request_id` (the `[Request ID: …]` Convex puts in the message, which finds the server log in the Convex dashboard). The server's message is never sent: in development it can carry argument values.
- **Source maps.** `@posthog/rollup-plugin` in `vite.config.ts`, active only when `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` are set, with `releaseName: "next-session-web"`, `releaseVersion` the commit SHA, and `deleteAfterUpload: true`, so no map reaches `dist/`. The deploy job sets them; `bun run check` and local builds do not, and build without maps as today.
- **Objection.** The `/privacy` page renders **Turn off usage measurement in this browser** (or **Turn it back on**) in every build that has the token, also after this browser turned it off. `posthog.opt_out_capturing()` does nothing in `cookieless_mode: "always"`, so the switch sets Next Session's own flag, `localStorage` key `next-session.measurementOff`, at the visitor's request. While it is set, init does not run and `before_send` and `logs.beforeSend` drop everything, also for a tab that started earlier. When the browser refuses storage, the opt-out holds for the visit and the page says so.
- **Logs.** `log()` wraps `posthog.logger`. The uses, each with an `outcome` or `reason` attribute and nothing else:
  - Save recovery, `finishPendingSave` (app start, the sheet's Finish saving, and a keep that finishes a leftover Save first): `info` "Pending save finished" (`saved`), or `warn` "Pending save refused" with the code or `unexpected`. Logged once per attempt: callers that wait on the same attempt share one line, and a retry after a refusal logs its own outcome.
  - A leftover Keep this group, `resumePendingKeep` (§12.4): `info` "Pending keep finished" (`kept`), or `warn` "Pending keep refused" with the code or `unexpected`.
  - The Copy fallback (#54): `warn` "Copy fell back to the selection" when the clipboard refused and `execCommand` worked, `error` "Copy failed" when both failed, with the `surface` and the refusal's error name.

  Console capture stays off: `console.*` carries whatever a library prints.
- **Proxy.** `worker/index.ts` adds `ingestTarget(url) → string | null`: `/ingest/static/*` and `/ingest/array/*` go to `eu-assets.i.posthog.com`; only the ingestion paths posthog-js uses (`/e/`, `/i/v0/e/`, `/i/v1/logs`, `/batch/`) go to `eu.i.posthog.com`; any other `/ingest/*` path answers 204 without being relayed. The Worker forwards only `content-type`, `content-encoding`, `user-agent`, `accept` and `accept-encoding`, so `Referer` (which carries the Share Token), cookies and credentials never leave. It sets `X-Forwarded-For` from `CF-Connecting-IP` (else every visitor hashes to one Cloudflare IP) and strips `set-cookie` from the answer. `wrangler.jsonc` adds `/ingest/*` to `assets.run_worker_first`. Worker requests count toward the free 100,000 per day; posthog-js batches, so a visit costs a handful.

### 13.5 Convex

`convex/model/telemetry.ts` is the server seam; `convex/telemetry.ts` holds the one internal action that talks to PostHog.

```ts
// convex/model/telemetry.ts (interface)
export type ServerEvent =
  | { name: "link_created"; actor: Actor; group_id: string } // Create your link: Anonymous GM and first Group
  | { name: "group_created"; actor: Actor; group_id: string }
  | { name: "account_created"; actor: Actor; method: "password" | "google"; tips_requested: boolean }
  | { name: "groups_saved"; actor: Actor; group_count: number }
  | { name: "player_joined"; actor: Actor; group_id: string; claimed: boolean }
  | { name: "player_claimed"; actor: Actor; group_id: string }
  | { name: "player_released"; actor: Actor; group_id: string }
  | { name: "session_scheduled"; actor: Actor; group_id: string; player_count: number; is_first_for_group: boolean }
  | { name: "session_cancelled"; actor: Actor; group_id: string }
  | { name: "share_link_rotated"; actor: Actor; group_id: string }
  | { name: "tips_confirmed"; actor: Actor }
  | { name: "calendar_feed_created"; actor: Actor } // the first me.calendarFeed, no token
  | { name: "calendar_feed_reset"; actor: Actor }; // me.resetCalendarFeed, no token

type Actor = Doc<"users"> | { playerId: Id<"players"> };

export async function track(ctx: MutationCtx, event: ServerEvent): Promise<void>;
export async function serverLog(ctx: MutationCtx, level: "info" | "warn" | "error", body: string, attributes: Record<string, string | number | boolean>): Promise<void>;
```

- `track` returns at once when `process.env.POSTHOG_PROJECT_TOKEN` is unset or the actor is an Account with `analyticsObjectedAt`, so tests and the local backend schedule nothing. Otherwise it builds the PostHog payload and calls `ctx.scheduler.runAfter(0, internal.telemetry.send, { events, logs })`. The scheduled call commits with the mutation, so a refused mutation sends nothing and a committed fact is sent once.
- The payload, built in one pure function `toPostHogEvent(event, now)` that the tests pin: event name `next_session:<name>`; `distinct_id` `next-session:<users._id>` for a user, `next-session:player:<playerId>` for a Player without an Account; properties `product: "next-session"`, the event's fields, `$process_person_profile: false` unless the actor is an Account, and `is_test_account: true` for an email under `.test`. No event carries an email address, and no event sets person properties beyond `next_session_account: true` on `account_created`.
- `internal.telemetry.send` is a default-runtime action: one `fetch` to `https://eu.i.posthog.com/batch/` for events, one to `https://eu.i.posthog.com/i/v1/logs` with an OTLP/JSON body for logs (`resource.attributes` `service.name: next-session-convex`, `product: next-session`), both with the project token. A failed send is logged to the Convex console and dropped; telemetry never retries into a user's mutation.
- Call sites, one line each, after the write succeeds: `auth.ts` `afterUserCreatedOrUpdated` (`link_created` for a new Anonymous GM; `account_created` for a new Account, any provider), `groups.create`, `account.finishSave`, `player.join` / `claim` / `release`, `sessions.schedule` / `cancel`, `groups.rotateShareToken`. The Expiry sweep (§5.5) calls `serverLog` once per run with the number of Groups deleted. Answers are not tracked on the server: taps are the high-volume path, and each `track` costs one action call out of Convex Free's 1M a month.
- `is_first_for_group` is true only when the schedule inserts the Group's first Session row, so a Schedule again is never first. `session_cancelled` records the GM's action, so a cancel inside the first Undo window still emits it.
- Redaction contract, as in Lonir: no Group name, no Player name, no Share Token, no claim code, no email. `group_id` and user ids are pseudonymous and stay.

Schema: `users` gains an optional `analyticsObjectedAt`. Michael sets it in the Convex dashboard when an Account objects by email; there is no UI for it.

### 13.6 Welcome Mail and Tips in PostHog Workflows

PostHog Workflows can do all of it (verified against the docs above, the workflow graph schema, and the webhook source in `PostHog/posthog` `nodejs/src/cdp/templates/_sources/webhook/incoming_webhook.template.ts`):

- **Trigger** with a `webhook` trigger. Its `auth_header` input makes PostHog refuse any request whose `Authorization` header does not match a secret, so only Convex can start a mail workflow. An `event` trigger would be the obvious choice, and it fails: the project token ships in the SPA, so anyone could post `account_created` with any address and use the shared project's sender to mail strangers.
- **Send** through the built-in email channel: a sender `Michael from Next Session <hello@next-session.link>`, with SPF and DKIM records PostHog generates. The agent adds them to the zone with the scoped Cloudflare token; they sit next to Resend's records on `send.next-session.link` and `resend._domainkey` and do not replace them. Reply-to is the contact email. The recipient comes from the trigger, `{event.properties.email}`, so PostHog holds no email on a person profile.
- **Wait** with `delay` steps (at most 30 days each) and `wait_until_condition` on an event.
- **Opt-out**: two message categories, "Next Session account" (transactional, Welcome Mail) and "Next Session tips" (marketing, Tips). Tips carry `{{ unsubscribe_url }}`; unsubscribing writes `$workflows_email_unsubscribed`, and PostHog skips the category from then on. Hard bounces land on the suppression list.
- **Volume**: a new sending project starts at tier 0, 100 mails a day, and climbs over about five weeks. Next Session's sign-ups fit inside it; mails over the cap wait, they are not lost.

Two workflows, in the shape `workflows-create` takes (#79 fills in template UUIDs, the sender id and the secret):

```
"Next Session: Welcome Mail"
trigger  webhook POST, auth_header = Bearer <POSTHOG_MAIL_WEBHOOK_SECRET>
         event next_session:welcome_requested, distinct_id {request.body.distinct_id}
         properties { product, email, tips_confirm_url } from the body
  → email "Welcome"  to {event.properties.email}  category: account (transactional), tracking off
  → exit

"Next Session: Tips"
trigger  webhook POST, same auth_header
         event next_session:tips_requested, distinct_id {request.body.distinct_id}, properties { product, email }
  → delay 2d
  → email "Tip 1: get your players in"  to {event.properties.email}  category: tips (marketing), tracking off
  → wait_until_condition  event next_session:session_scheduled [product = next-session]  max 5d
      matched → exit                                         (they already did it)
      timeout → email "Tip 2: pick the date" → exit
```

A forged `session_scheduled` for someone's distinct id could only skip their second Tip; that is the whole blast radius of a public event in this design.

`convex/mail.ts` holds `requestMail(ctx, {kind: "welcome" | "tips", user, tipsConfirmUrl?})`. It returns at once when `POSTHOG_MAIL_WEBHOOK_SECRET` is unset or the address is under `.test`, and otherwise starts an internal action through `@convex-dev/action-retrier` (at most 4 attempts, exponential backoff, retrying network errors and 5xx) that posts `{distinct_id, product, email, tips_confirm_url}` to the workflow's webhook URL (`POSTHOG_WELCOME_WEBHOOK_URL`, `POSTHOG_TIPS_WEBHOOK_URL`). A timeout after PostHog accepted a request can send a mail twice; that is the accepted cost of not losing one.

Double opt-in, end to end:

1. The Save sheet shows an unticked box under the password: "Email me two short tips for getting the first game night on the calendar". Only the Save sheet: the GM path is where the tips fit. Keep this group and Log in show no box.
2. Sign-up passes `tips: "yes"` in the Password params. The profile stores `tipsRequestedAt` and `tipsConsentVersion: "1"` (the box's wording, kept in `shared/tips.ts`). `afterUserCreatedOrUpdated` requests the Welcome Mail for every new Account; for a ticked box it first mints a 32-byte code, stores its SHA-256 as `tipsCodeHash` (the `saveClaims` pattern), and passes `tipsConfirmUrl: https://next-session.link/tips?confirm=<code>` (`SITE_URL` plus `/tips`). The parameter is `confirm`, not `code`: `ConvexAuthProvider` takes any `?code=` on load as an OAuth code, strips it and calls `auth:signIn`. Google sign-up (#58) has no box: the Welcome Mail leaves in the mutation that creates the user, before a tick could cross the redirect.
3. The Welcome Mail shows the confirmation block only when the trigger event has `tips_confirm_url`. #79 checks with `workflows-test-run` that the email step's Liquid reads the trigger event.
4. `/tips?confirm=…` reads nothing on load except the code from the URL, then removes it from the address bar. It shows the box's wording and one button, **Yes, send me the tips**. Only the press calls `account.confirmTips({code})`: it finds the user by hash within 3 days of `tipsRequestedAt`, sets `tipsConfirmedAt`, tracks `tips_confirmed`, and requests the Tips workflow. The hash stays, so a second press (another tab, the mail link opened again) answers `alreadyConfirmed: true` and requests nothing more. It returns `{confirmed, alreadyConfirmed}` and needs no session, because the code proves the inbox. A new global rate limit `confirmTips` (token bucket, 30 per minute, capacity 60) keeps it from being used to guess codes, on top of the 256-bit code. After the press the page says "Done. The first tip arrives in two days." or "This link has expired. That's fine, you'll just get no tips.", and after a second press "Already confirmed. You asked for the tips already. Nothing more to do."

Schema: `users` gains `tipsRequestedAt`, `tipsConsentVersion`, `tipsCodeHash` (indexed `by_tipsCodeHash`) and `tipsConfirmedAt`, all optional. Nothing to migrate.

#### Copy

In Michael's voice, plain text first (every template carries a real `text` part), then the same words in the design. Sender "Michael from Next Session".

**Welcome Mail.** Subject: `Welcome to Next Session`

> Hi there 👋,
>
> thanks for creating your Next Session account!
>
> Your groups now follow you to every device. Log in on next-session.link with this email address, and My groups shows every group you run or play in.
>
> [Open My groups](https://next-session.link/me)
>
> {% if event.properties.tips_confirm_url %}You asked for two short tips on getting your first game night on the calendar. Please confirm it was you, so I don't mail a stranger:
>
> [Yes, send me the tips]({{ event.properties.tips_confirm_url }})
>
> {% endif %}Didn't create this account? Just reply and I'll delete it.
>
> Thanks!
> Michael

**Tip 1, two days after confirming.** Subject: `Get your players in`

> Hey 👋,
>
> Next Session works best when everyone answers. The fastest way there:
>
> - Open your group and tap **Copy** or **WhatsApp** on the Share Link. Your players tap the days they can play: no account, about 30 seconds.
> - Missing someone? Add their name under **Players**, so they only have to tap.
> - The grey bars show who hasn't answered yet. A friendly nudge in your group chat does the rest.
>
> [Open My groups](https://next-session.link/me)
>
> Thanks!
> Michael
>
> You get this because you asked for tips. [Unsubscribe]({{ unsubscribe_url }})

**Tip 2, five days later, unless a Session was scheduled.** Subject: `Pick the date`

> Hey again,
>
> once a few answers are in, the calendar does the math for you:
>
> - **Best Nights** shows the top three dates nobody marked busy.
> - Tap a day, then **Schedule**. Your players see the date right away.
> - Plans changed? **Cancel** it, and Undo is there if you slip.
>
> That's the last tip from me. Have a great game night 🎲
>
> [Open My groups](https://next-session.link/me)
>
> Thanks!
> Michael
>
> You get this because you asked for tips. [Unsubscribe]({{ unsubscribe_url }})

### 13.7 Session updates share the Workflows mail path

> Superseded by §15 ([ADR-0012](adr/0012-session-mail-goes-through-resend-and-carries-the-calendar-invite.md)) once `RESEND_API_KEY` is set.

Session updates use the §12.6 Convex fan-out and `POSTHOG_SESSION_WEBHOOK_URL`, reusing `POSTHOG_MAIL_WEBHOOK_SECRET`, the sender and the action retrier. Michael chose this over Resend on 2026-10-07. Definitions in `docs/posthog/workflows/session-updates.json` and `templates/session-update.json` are draft-only: secret, sender, template and category placeholders must be resolved by #102.

Each mail names the Group and the night, states "set" or "cancelled", and has one button to the current Share Link. It reads as system mail: the sender is "Next Session" and no person signs it, since the GM who scheduled the night is rarely the person who built Next Session. The template includes real plain text and editable design blocks, with tracking off and a link to the authenticated My groups email preference. Michael confirmed on 2026-10-07 that "Session updates" is `transactional`. Its category bypasses hosted marketing opt-outs; the `/me` switch controls Session emails without changing Tips consent. No notification promise or production mail environment ships in #97.

### 13.8 Credentials and switch-on

Michael already provided the project token (`~/.config/next-session/posthog.env`, `POSTHOG_PROJECT_TOKEN`, EU). Never printed, never committed.

| Value | Who | Where it goes |
| --- | --- | --- |
| Project token (have it) | Agent | Repo variable `VITE_POSTHOG_TOKEN` (the deploy job passes it to `bun run build`); Convex prod env `POSTHOG_PROJECT_TOKEN`. It is public by design (it ships in the bundle), but stays out of issues and logs |
| Project ID | Agent, read with the personal API key | Repo variable `POSTHOG_PROJECT_ID` |
| Personal API key, scopes `error_tracking:write` (source maps) and `hog_flow:write` (workflows, templates, categories) | **Michael** | `~/.config/next-session/posthog.env` as `POSTHOG_PERSONAL_API_KEY`; repo secret `POSTHOG_PERSONAL_API_KEY` for the deploy job |
| "Cookieless server hash mode" on, "IP data capture" reads discard | **Michael** (shared project settings) | PostHog project settings |
| Accept the no-banner browser measurement (§13.3), or pick the banner | **Michael**, as the controller | A comment on the switch-on ticket. Until then `VITE_POSTHOG_TOKEN` stays unset and only the server side runs |
| Mail webhook secret | Agent generates it | Convex prod env `POSTHOG_MAIL_WEBHOOK_SECRET`, and the `auth_header` of both workflows; the two webhook URLs go to `POSTHOG_WELCOME_WEBHOOK_URL` and `POSTHOG_TIPS_WEBHOOK_URL` |
| Email channel `hello@next-session.link` | **Michael** creates it in Workflows → Channels; the agent adds the DNS records PostHog shows | PostHog, Cloudflare zone |

The CI `check` and `e2e` jobs set none of these, so they build and test with telemetry off, as dev does.

### 13.9 Moving to a dedicated project later

If Michael redirects call 1: create the project in EU Cloud, then change the repo variables `VITE_POSTHOG_TOKEN` and `POSTHOG_PROJECT_ID`, the Convex env `POSTHOG_PROJECT_TOKEN`, re-create the email channel, categories, templates and workflow there (the ticket keeps their definitions in `docs/posthog/`), and redeploy. The Product Marker and the `next_session:` prefix stay; they cost nothing in a project of its own.

### 13.10 Test seams

| Seam | Tested through |
| --- | --- |
| `redactUrl`, `redactEvent`, `redactLog` in `src/lib/telemetry.ts` | Vitest on plain strings, event objects and log records: Share Token paths, `code`, `month` and `day`, referrers, `$initial_*`, `$session_entry_url`, `url.full`, and the dropped device properties. One test serializes a real `posthog-js` request (captured with a fake transport) on `/s/<token>?code=x` and finds neither value |
| `initTelemetry` | Vitest with a fake `posthog`: no token means no `init`; a token means the options above, the Product Marker registered, and no flag call |
| `ingestTarget` in `worker/index.ts` | Vitest: static and array paths to the assets host, the rest to the API host, non-ingest paths `null`; a Worker test for the stripped cookies and `X-Forwarded-For` |
| `toPostHogEvent` in `convex/model/telemetry.ts` | Vitest on plain data: names, distinct ids, the marker, `is_test_account`, person processing, no email anywhere |
| `track` and the call sites | `convex-test`: with the env unset nothing is scheduled; with it set, each mutation in §13.5 schedules exactly one `telemetry.send` with the expected event, a refused mutation schedules none, and an Account with `analyticsObjectedAt` schedules none |
| `requestMail` | `convex-test` with a fake `fetch`: no secret or a `.test` address requests nothing; a 503 then 200 retries once and sends once; a 400 is not retried |
| `account.confirmTips` | `convex-test`: a valid code within 3 days confirms once, tracks `tips_confirmed` and requests the Tips workflow; a second press returns `alreadyConfirmed: true` and requests nothing more; an unknown or late code returns `confirmed: false` and requests nothing |
| `src/lib/errors.ts` reporting | Vitest: a Convex error without a code is reported with the request ID; a coded error is not |
| The Save sheet box, the `/tips` page, the `/privacy` opt-out | Testing Library: the box is unticked by default and the sign-up params carry `tips` only when ticked; rendering `/tips` calls nothing, and only the button press calls `confirmTips`; both outcomes; the opt-out sets and clears `next-session.measurementOff` |
| The browser events and logs at their call sites | Testing Library and Vitest with a fake `track` and `log` (a partial `vi.mock` of `src/lib/telemetry`): `ShareLinkCard`, `LandingView`, `PlayerCalendar`, `AccountSheet`, `MyGroups`, `useRemoval`, `save.ts`, `keep.ts`. Each asserts the exact event once, and that no name, token or claim code is in it |
| The whole flow | Playwright on the local backend with telemetry off proves nothing breaks. The switch-on ticket proves the live path once with a real address: sign up with Tips, receive the Welcome Mail, confirm, see `tips_confirmed` and the Tips workflow run parked on its delay |

### 13.11 Build plan

| # | Ticket | Blocked by | Write scope |
| --- | --- | --- | --- |
| [#74](https://github.com/Silthus/next-session/issues/74) | Browser telemetry: init, redaction, errors, source maps, `/ingest` proxy, opt-out | — | `src/lib/telemetry.ts`, `src/features/legal/**`, `src/main.tsx`, `src/routes/__root.tsx`, `worker/**`, `wrangler.jsonc`, `vite.config.ts`, `package.json`, `bun.lock`, the deploy job in `.github/workflows/ci.yml` |
| [#75](https://github.com/Silthus/next-session/issues/75) | Server telemetry: the Convex seam and lifecycle events | — | `convex/telemetry.ts`, `convex/model/telemetry.ts`, `convex/schema.ts` (`users.analyticsObjectedAt`), one-line call sites in `convex/{auth,account,groups,player,sessions,cleanup}.ts`, their tests, the sign-up email in `e2e/production.spec.ts` |
| [#76](https://github.com/Silthus/next-session/issues/76) | Browser events and logs at the UI call sites | #74, #64, #65 | `src/lib/errors.ts`, `src/ui/ShareLinkCard.tsx`, `src/features/landing/**`, `src/features/player/**`, `src/features/account/save.ts`, `src/features/account/keep.ts`, `src/features/account/AccountSheet.tsx` |
| [#77](https://github.com/Silthus/next-session/issues/77) | Privacy Policy for PostHog | #64 | `docs/legal/privacy.md`, `shared/legal.ts` |
| [#78](https://github.com/Silthus/next-session/issues/78) | Mail: Welcome Mail requests and double opt-in Tips | #75, #76 | `convex/mail.ts`, `convex/convex.config.ts` (action-retrier), `convex/schema.ts` (`users` Tips fields), `convex/account.ts`, `convex/auth.ts`, `convex/model/rateLimits.ts`, `shared/tips.ts`, `package.json`, `bun.lock`, `src/features/account/AccountSheet.tsx`, `src/routes/tips.tsx`, `src/features/tips/**` |
| [#79](https://github.com/Silthus/next-session/issues/79) | Switch on PostHog: keys, settings, sender, workflows, live proof | #74, #75, #76, #77, #78 | Repo variables and secrets, Convex prod env, zone DNS, the PostHog project, `docs/posthog/**` (the workflow and template definitions) |

Lanes: #74 and #75 start now, in parallel. #76 waits for #64 and #65 because they own `src/features/player/**` and `src/features/account/**` today. #77 waits for #64's privacy bump.  #75 changes one line of `e2e/production.spec.ts`, which #65 extends with step 8; the later one rebases. Google sign-in (#58) also edits `convex/auth.ts` and `src/features/account/**`: whichever of #58, #75 and #78 lands later rebases. #67 edits `src/features/group/rail/**`, which #76 does not touch (the rail's Share Link uses `ShareLinkCard`).

## 14. Calendar files

Calendar files carry a Group's published Sessions into players' own calendars. They read `published` only ([ADR-0013](adr/0013-sessions-publish-a-snapshot-after-the-undo-window.md)), so the Undo window holds for them as it does for mail. The builder is `shared/icalendar.ts`. S3 of the calendar sync map (#167) specifies them; this section holds what has shipped.

### 14.1 Calendar download

`GET next-session.link/cal/s/<Share Token>.ics` is the **Calendar download**: one Group's upcoming Sessions, for whoever holds the Share Link.

- A Convex HTTP action (`downloadGroupCalendar` in `convex/calendarFiles.ts`, routed in `convex/http.ts`) reads through the internal query `calendarFiles.groupDownload` with the token and the serve time. The query finds the Group by its **current** Share Token only, so a rotated-away token opens nothing, even inside the rotation's Undo.
- It holds the published **scheduled** Sessions dated from today (UTC) to the end of the Booking Window, read through the `by_groupId_and_date` index range. Cancelled and past Sessions are left out: a one-time import has nothing to cancel. A Session inside its first Undo window isn't published yet, so it is absent, and a move inside a later window shows the old time until the window ends. A published row that still lacks `start`, `end` or `summary` (possible only before the S2 backfill runs) is left out instead of failing the file.
- Each entry: `UID` `<sessionId>@next-session.link`, `SEQUENCE` the Session's `sequence` (0 before any invite, §15.3), `DTSTAMP` the serve time, `DTSTART` and `DTEND` in UTC, `SUMMARY` the published Group name, `LOCATION` the published location, `STATUS:CONFIRMED`, and the Share Link (built from `SITE_URL`) as `URL` and in `DESCRIPTION`. The calendar is named after the Group.
- `200` with `Content-Type: text/calendar; charset=utf-8`, `Cache-Control: private, max-age=900` and `Content-Disposition: attachment; filename="next-session.ics"`. A Group with nothing upcoming gets an empty calendar. An unknown or rotated-away token, or a path outside the Share Token alphabet, gets `404` with no body.
- No rate limit, no Expiry touch and no server event: reads are cheap and cached for 15 minutes, and a download is not activity on the Group. The browser sends `calendar_downloaded` on the press instead (§13.4).
- **Add to calendar** in the player page's Next sessions card links here (§12.4).
- A rename settles the scheduled upcoming Sessions through `groupChanged` (§12.6), so the download shows the new name once the Undo window ends. A Cancelled Session keeps its old name until **Schedule again**. Without `RESEND_API_KEY` the rename sends no Session update, because the state didn't change; with it, Session mail (§15) sends a "changed" mail with the new name.

### 14.2 Calendar feed

`GET next-session.link/cal/a/<feed token>.ics` is the **Calendar feed**: every Session of every Group an Account runs or plays in, for whoever holds the feed link. The Account subscribes to it once in its calendar app.

- The feed token is `users.calendarFeedToken`, 22 characters from the Share Token alphabet (132 bits), drawn by the same `randomToken` helper in `shared/randomToken.ts`. It is a stored bearer credential in the sense of [ADR-0004](adr/0004-share-token-is-the-player-credential.md), not an HMAC, so **Reset feed link** revokes it.
- `me.calendarFeed({}) → {url}` mints the token on the first call and returns the same URL after. `me.resetCalendarFeed({}) → {url}` replaces it at once, with no Undo: a leaked feed wants a hard stop. Both need an Account (`UNAUTHENTICATED` for an Anonymous GM or a visitor) and each new token spends the `calendarFeed` rate limit of the Account (§5.4). Showing the link the Account already has spends nothing, so opening My groups again never locks an Account out of its own link. `url` is `<SITE_URL>/cal/a/<token>.ics`; the web app derives the `webcal://` form from it.
- The first mint tracks `calendar_feed_created` and a reset tracks `calendar_feed_reset`, both with only the actor. No token reaches an event or a log, and feed polls are not tracked.
- A Convex HTTP action (`serveAccountFeed` in `convex/calendarFiles.ts`, routed in `convex/http.ts`) reads through the internal query `calendarFiles.accountFeed` with the token and the serve time. The query finds the Account by its **current** token only, so a reset token opens nothing.
- It holds the published Sessions dated from 31 days back (UTC) to the end of the Booking Window, of the Groups the Account runs (at most 50) and the Groups where it has a Claimed Player (at most 50), each Group once. Each Group's Sessions come from one `by_groupId_and_date` index range capped at the days in the window. A Cancelled Session carries `STATUS:CANCELLED`, so a subscribed calendar shows it as off until it drops out of the window. The past month stays because many calendar apps delete what drops out of a feed. A Group the Account released, removed from My groups or deleted is gone from the next fetch, even while a deleted Group's Players are still being removed.
- Each entry is built as in the Calendar download (§14.1), except its `URL` and `DESCRIPTION` link carry no Share Token: `<SITE_URL>/g/<groupId>` for a Group the Account runs, and `<SITE_URL>/me` for one it plays in. A Group it runs and plays in links to its GM page. The calendar is named "Next Session".
- `200` with `Content-Type: text/calendar; charset=utf-8` and `Cache-Control: private, max-age=900`, and no `Content-Disposition`. An Account with nothing in the window gets an empty calendar, so a subscription survives a quiet month. An unknown or reset token, or a path outside the token alphabet, gets `404` with no body.
- No rate limit, no Expiry touch and no server event on a fetch: a calendar app polling a feed is not activity on any Group.
- My groups offers it in a **Your calendar** block right above the Session emails switch, shown to an Account with at least one Group it runs or plays in. **Subscribe in your calendar app** calls `me.calendarFeed` on the press, never on load, so opening My groups mints nothing. The block then shows the link in a read-only field with **Copy link**, **Open in calendar app** (the `webcal://` form) and a help line for Google Calendar. **Reset feed link** ("Stops the old link at once.") calls `me.resetCalendarFeed` with no confirmation and no Undo, shows the new link, and a toast says calendars on the old link stop updating.
- The Privacy Policy (1.9) names the feed link, what the calendar app receives, and that the link is kept until the Account resets it or is deleted.

### 14.3 Worker

The Worker proxies `/cal/` the way it proxies `/ingest/`, so the URL stays on `next-session.link` and survives a Convex deployment change. `/cal/*` is in `run_worker_first`.

- `calendarTarget(url, convexSiteUrl)` maps `/cal/s/<token>.ics` and `/cal/a/<token>.ics`, with a token from `A-Za-z0-9_-`, to the same path on the Convex site and drops the query string. Anything else under `/cal/` has no target and gets `404` with no body. Any method but `GET` gets `405`.
- The Convex site origin is the `CONVEX_SITE_URL` var in `wrangler.jsonc` (`https://pleasant-sockeye-672.convex.site`).
- The upstream request carries no cookies and no client headers. The response keeps the status, `content-type`, `cache-control` and `content-disposition`, and drops every other header, `set-cookie` included.
- The Vite dev server proxies `/cal/` to `VITE_CONVEX_SITE_URL`, which `convex dev` writes to `.env.local` and the e2e server sets to the local site port. So the relative link `/cal/s/<token>.ics` works locally, in e2e and in production.

## 15. Session mail

Every Session update is one mail through Resend that carries a calendar invite ([ADR-0012](adr/0012-session-mail-goes-through-resend-and-carries-the-calendar-invite.md)). It supersedes §12.6 and §13.7 once `RESEND_API_KEY` is set. S4 of the calendar sync map (#146) specifies it; this section holds what has shipped.

### 15.1 The provider switch

- `calendarMailConfigured()` in `convex/mail.ts` is true when `RESEND_API_KEY` is set. CI and dev never set it.
- `settle` (§12.6) calls `sessionPublished` in `convex/sessionMail.ts` on every publish. With the key, it starts a broadcast round and requests no Workflows Session update. Without it, the §12.6 Workflows path runs exactly as before, and nothing reaches Resend or is counted for it. So a change never mails twice.

### 15.2 Who gets it

- The **calendar recipient set** of a Group is the GM's Account plus the Accounts behind its Claimed Players, deduplicated (`convex/model/recipients.ts`). The GM who made the change is included.
- Every send also needs, at queue time and again on every attempt, an Account that is not anonymous, has an email, isn't a `.test` address, and hasn't turned Session emails off on My groups, whose switch reads "Email me a calendar invite when a session is set, changed or cancelled".

### 15.3 A broadcast round

- Every publish is a round, because the invite carries the start, end, location and Group name: `set` for a first publish or **Schedule again**, `changed` for a new start, length, location or Group name, `cancelled` for a cancel. A publish that keeps a Cancelled Session cancelled sends nothing: those calendars already hold the cancel.
- A round raises `sessions.sequence` by one (missing is 0), sets `sessions.wholeRoundSent`, and queues one send per eligible recipient, each carrying `{kind: "broadcast", change, sessionId, userId, revision, sequence}`. The published snapshot carries the Group's zone, so a mail names the time in the zone its night was published in, even while a zone change waits out its Undo window.
- Sends are scheduled 600 ms apart within a round, under Resend's 2 requests a second. Two rounds that overlap rely on the retries.
- Each attempt rechecks, in `sessionMail.calendarMail`, that `published.revision` still equals the send's revision and that the Account is still in the set and eligible. A send whose revision moved on drops itself, so a slow mail never overwrites a newer change. Staleness is judged by revision, never by `sequence`.

### 15.4 Entering or leaving the set

- Every mutation that can move an Account into or out of a Group's set runs its change through `changeRecipientSet` in `convex/sessionMail.ts`, which compares membership before and after in the same transaction: a claim (**Join** while signed in, **Keep this group**, the auto-keep on answer) and a release (**Not you?**, **Remove from my groups**) in `convex/model/players.ts`, the GM removing a Player, and **Save**, which makes the Account the GM of the moved Groups.
- A set that ends where it began sends nothing: a switch to another name in the same Group, or a GM releasing their own Player.
- Entering schedules `sessionMail.inviteToNights` for that Group and Account, so a Save that moves many Groups stays under Convex's 1,000 scheduled functions per mutation. It rechecks that the Account is still in the set and eligible, then queues an `invite` for each upcoming Session (from today, UTC, to the end of the Booking Window) whose published state is scheduled: a `request` to that Account alone, `{kind: "invite", sessionId, userId, revision, sequence}`.
- Leaving queues a `withdraw` for each upcoming published Session, Cancelled ones included, so an entry whose cancel the release dropped still leaves: `{kind: "withdraw", groupId, userId, date, entry}`, with `entry` frozen as `{uid, sequence, start, end, summary}`.
- Each raises that Session's `sequence` by one. Staleness stays with the revision, so an invite never drops another recipient's pending broadcast.
- An invite sends only while its revision is still published, the Session is still scheduled and the Account is still in the set. A withdrawal sends only while the Account is still out of the set, whatever the revision; a deleted Group counts as out. It is built from its frozen entry, so it lands after the Group is deleted and never shows a change made after the release. A re-claim before it sends makes it drop itself.
- Both need an eligible Account (§15.2) when queued and on every attempt, so the Session emails switch stops them too.

### 15.5 Deleting a Group

- `deleteGroup` in `convex/model/groups.ts` is the one deletion path, for `groups.remove` and the Expiry sweep. Before the Group and its children go, it calls `groupDeleting` in `convex/sessionMail.ts`.
- `groupDeleting` writes one `calendarCancellations` row: the GM's Account, the eligible Accounts of the calendar recipient set at deletion (§15.2), and each upcoming published Session, frozen as `{date, entry}` with `entry` `{uid, sequence, start, end, summary}` and `sequence` reserved as the Session's `sequence + 1`. A Session already published as Cancelled is cancelled again, because its cancel may still be waiting for a retry that the Group's deletion would drop. Never-published and past Sessions are left out. With nothing to cancel, or no eligible Account, no row is written. Without `RESEND_API_KEY` nothing is written, so deletion runs exactly as before.
- `sessionMail.drainCancellations` queues at most 200 `deletionCancel`s per run, `{kind: "deletionCancel", userId, reader, date, entry}`, moves the row's `cursor`, and runs again once its sends are due, 600 ms apart, so a large Group stays under Resend's rate and far below Convex's 1,000 scheduled functions per mutation. The run that queues the last batch deletes the row.
- A deletion cancel is a `cancel` with `STATUS:CANCELLED`, built from its frozen entry, because the Group is gone. Its `SEQUENCE` is above every invite the Session sent. It sends whenever the Account is still eligible (§15.2), so an Anonymous GM, whose Account ends with its last Group, gets nothing.

### 15.6 The Resend adapter

- `POST https://api.resend.com/emails` with `from: "Next Session <calendar@next-session.link>"`, one recipient, `text` and `html`, and one attachment `invite.ics`, base64, with `content_type` from `calendarContentType` (`text/calendar; charset=utf-8; method=REQUEST|CANCEL`). No `reply_to`.
- `Idempotency-Key: calendar/<uid>/<sequence>/<userId>/<fingerprint>`, where the fingerprint is a hash of the request body, so a retry of a request Resend accepted is not sent twice within its 24 hours, and a retry whose body changed (a rotated Share Link) is a new request instead of one Resend refuses.
- Network errors, 5xx and 429 retry through the action retrier: 4 attempts, backoff 5 s × 4ⁿ. Other 4xx are logged with the status only and dropped.

### 15.7 The invite

- Built by `invite` in `shared/icalendar.ts` from the published snapshot: `request` for a scheduled Session, `cancel` (with `STATUS:CANCELLED`) for a cancelled one. A withdrawal is a `withdraw` (`METHOD:CANCEL` with no `STATUS`) built from its frozen entry, with the Player link. A deletion cancel is a `cancel` built from its frozen entry, with the Player link for GM and Player alike, since the Group's page is gone.
- `UID` `<sessionId>@next-session.link` for the row's whole life, `SEQUENCE` and `DTSTAMP` the round's, so a retry repeats its request byte for byte under the same Idempotency-Key, `DTSTART` and `DTEND` in UTC, `SUMMARY` the published Group name, `LOCATION` the published location.
- `URL` is token-free and built from `SITE_URL` (`convex/model/siteLinks.ts`): `/g/<groupId>` for the GM, `/me` for a Player. `DESCRIPTION` is "Open your group: <that link>".
- `ORGANIZER` is `calendar@next-session.link`; the `ATTENDEE` is the recipient with `PARTSTAT=ACCEPTED;RSVP=FALSE`. No `VALARM`.

### 15.8 Copy

`sessionMailCopy` in `convex/model/sessionMailCopy.ts` is pure: plain text first, then the same words in HTML (the Workflows template's cream background, mono "NEXT SESSION" header and one button, no images, no tracking). System mail: nobody signs.

`{when}` is "Saturday, October 31, 2026, 19:00–23:00, Berlin time", in the published zone with its city (the Group's zone for a snapshot published before Session mail). `{where}` is the line "Where: <location>" when there is one. The button "Open your group" goes to the Share Link for a Player and to `/g/<groupId>` for the GM.

| Change | Subject | Player | GM |
| --- | --- | --- | --- |
| Set | `{group}: next session {date}` | The next session for {group} is set: {when}. {where} | You set the next session for {group}: {when}. {where} |
| Changed | `{group}: session on {date} changed` | The session for {group} on {date} changed. It's now {when}. {where} | You changed the session for {group} on {date}. It's now {when}. {where} |
| Cancelled | `{group}: session on {date} cancelled` | The session for {group} on {date} is cancelled. | You cancelled the session for {group} on {date}. |
| Invite (entered the set) | `{group}: next session {date}` | You keep {group} now, so its session is in your calendar: {when}. {where} | {group} is yours now, so its session is in your calendar: {when}. {where} |
| Withdrawal | `{group}: session on {date} removed from your calendar` | You don't keep {group} any more, so its session on {date} leaves your calendar. | — (a GM never leaves the set) |
| Deletion cancel | `{group}: session on {date} cancelled` | {group} was deleted, so its session on {date} is off. | You deleted {group}, so its session on {date} is off. |

Then, for set, changed and invite: "It's in the calendar invite in this mail. Not in your calendar yet? Tap **Add to calendar** once." For cancelled, withdrawal and deletion cancel: "Your calendar removes it by itself. If it doesn't, delete it there." Then the button, except in a withdrawal or a deletion cancel. Footer: "You get this because you run this group.", "…because you keep this group." or, in a withdrawal or a Player's deletion cancel, "…because you kept this group.", and in the GM's deletion cancel "…because you ran this group.", then "Turn session emails off in My groups: <SITE_URL>/me. Replies to this address aren't read."

### 15.9 Volume

`mailVolume` counts per provider and UTC day: Resend for Session mail (1 per send), Workflows for Welcome (1), Tips (2) and the Workflows Session update (1). A row without a provider is a Workflows count from before the split. Each provider warns once through `serverLog` ("Daily mail volume warning", with `provider`) when its day reaches 80 and once when it passes 100. Suppressed recipients aren't counted and a retry isn't counted twice. No email, Group name or Share Token reaches a usage event or log.

### 15.10 One-time invites

The Sessions published before the switch-on never had a Resend send. `oneTimeInvites.inviteScheduledSessions`, started once with `convex run` after `RESEND_API_KEY` is set, gives them their invites:

- It reads the upcoming Sessions (today, UTC, to the end of the Booking Window) through the `by_date` index, soonest first, 20 a page so a page of full Rosters stays within Convex's reads per transaction, and takes those whose published state is scheduled and that never had a whole round (`wholeRoundSent` unset). A newcomer's invite or a withdrawal raises `sequence` but is not a whole round, so it doesn't make the run skip the GM and the other Players.
- Each gets one round to its whole calendar recipient set with the "Set" copy (§15.8), because the GM and the Players have had the night for a while: `sequence` rises by one, `wholeRoundSent` is set, and one `broadcast` send with `change: "set"` goes to each eligible recipient. A Session with no eligible recipient is passed over and stays unsent.
- Pacing: a run tops the day's Resend count up to 50 of the 100, leaving half for live Session mail, and stops before the first Session whose round wouldn't fit. It then runs again at the next UTC midnight. A round larger than 50 on its own goes alone as the first send of a day, so a big Group never stalls the rest.
- A Session published again before its turn gets a broadcast, which is a whole round, and the run skips it. A second start after it finished queues nothing.
- Without `RESEND_API_KEY` it does nothing and leaves every Session for the start after the switch-on.
- It ends with one `serverLog` line, "One-time invites finished", with `sessions_invited` and `invites_queued` only.

### 15.11 Test seams

| Seam | Tested through |
| --- | --- |
| Session mail and the Resend adapter | `convex-test` through `api.sessions.*`, `api.groups.*`, `api.player.*`, `api.roster.removePlayer` and `api.account.finishSave` with fake timers and a fake `fetch` that records Resend payloads and decodes `invite.ics` (`convex/sessionInvites.test.ts`) |
| The provider switch and the Workflows path | the same file and `convex/sessionMail.test.ts` |
| Deleting a Group | `convex-test` through `api.groups.remove` and `internal.cleanup.sweepExpiredGroups` with the same fake `fetch`, the 100 Accounts × 20 Sessions drain under Convex's transaction limits (`convex/sessionCancellations.test.ts`) |
| Copy | `sessionMailCopy` on plain data with Vitest (`convex/model/sessionMailCopy.test.ts`) |
| One-time invites | `convex-test` through `internal.oneTimeInvites.inviteScheduledSessions` with the same fake `fetch` and fake timers, the day's Resend count seeded in `mailVolume` (`convex/sessionInvites.test.ts`) |
