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

export default defineSchema({
  ...authTables,
  users: defineTable({
    // Convex Auth fields
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Legal Acceptance
    acceptedTermsVersion: v.optional(v.string()),
    acceptedPrivacyVersion: v.optional(v.string()),
    acceptedLegalAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  groups: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    shareToken: v.string(),
    previousShareToken: v.optional(v.string()), // for Undo after a rotation
    shareTokenRotatedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()), // set only while the Group is unsaved
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
  }).index("by_groupId_and_date", ["groupId", "date"]),

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
3. A Group has at most one Session per date and at most one Answer per Player per date.
4. `expiresAt` is set if and only if the owner is an Anonymous GM.
5. An Anonymous GM owns at least one Group. Deleting its last Group, by hand or by Expiry, deletes the Anonymous GM and its auth rows.
6. Names are trimmed, inner whitespace is collapsed, and they are 1 to 60 characters. `nameKey` is the lowercased name. Player names are unique per Group by `nameKey`.
7. Limits: 100 Players per Group, 50 Groups per GM.
8. Dates are UTC calendar dates (ported from Lonir ADR-0047). The Booking Window runs from today to the last day of the current month + 2. Answers, Fill Rest, and Sessions outside it are rejected; past dates are read-only.
9. A Player is claimed by at most one Account, and only by an Account, never an Anonymous GM. An Account claims at most one Player per Group and at most 50 Players in total. A Player row is deleted only by the GM (`roster.removePlayer`, `groups.remove`) or by its Group's Expiry; releasing a claim, **Not you?**, and signing out never delete it (§12).

## 4. Backend modules and functions

Every public function declares `args` and `returns` validators. Failures throw `ConvexError<{ code: ErrorCode }>`, and the UI maps codes to copy in one place (`src/lib/errors.ts`).

`ErrorCode` = `NOT_FOUND | INVALID_NAME | NAME_TAKEN | ROSTER_FULL | TOO_MANY_GROUPS | OUT_OF_WINDOW | SESSION_EXISTS | UNDO_EXPIRED | CLAIM_INVALID | RATE_LIMITED | UNAUTHENTICATED | EMAIL_TAKEN | INVALID_CREDENTIALS | WEAK_PASSWORD | PLAYER_CLAIMED`.

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
| | `create` | mutation | `{}` → `Id<"groups">` | "My group", fresh token, `expiresAt` for an Anonymous GM. Rate limit `createGroup` |
| | `rename` | mutation | `{groupId, name}` → `null` | Name rules |
| | `remove` | mutation | `{groupId}` → `null` | Deletes the Group row, then schedules `internal.groups.deleteChildren` (batches of 200). Ends an Anonymous GM that owned only this Group |
| | `rotateShareToken` | mutation | `{groupId}` → `null` | Keeps `previousShareToken` and `shareTokenRotatedAt` |
| | `undoRotateShareToken` | mutation | `{groupId}` → `null` | Within 30 s of the rotation, else `UNDO_EXPIRED` |
| `schedule` | `month` | query | `{groupId, month: "YYYY-MM"}` → `{players, answers, sessions}` | The Roster, the month's Answers, and every Session of the Group (a few dozen at most), as raw rows. All derivation happens in `shared/monthSummary.ts` on the client |
| `roster` | `addPlayer` | mutation | `{groupId, name}` → `Id<"players">` | Name rules, `NAME_TAKEN`, `ROSTER_FULL` |
| | `renamePlayer` | mutation | `{playerId, name}` → `null` | Owner check through the Player's Group |
| | `removePlayer` | mutation | `{playerId}` → `null` | Deletes the Player's Answers too |
| `sessions` | `schedule` | mutation | `{groupId, date}` → `Id<"sessions">` | `OUT_OF_WINDOW` for past or outside dates, `SESSION_EXISTS` |
| | `unschedule` | mutation | `{sessionId}` → `null` | Hard delete |
| `player` | `group` | query | `{shareToken}` → `PlayerGroupView \| null` | groupId, name, Players (id, name), every Session date of the Group (the client filters them by the Booking Window), and `claimedPlayerId`: the caller's Claimed Player in this Group, or `null`. `null` renders the not-found page |
| | `answers` | query | `{shareToken, playerId, month}` → `Record<date, Answer> \| null` | `null` for an unknown token, a foreign or removed Player, or a malformed id or month |
| | `join` | mutation | `{shareToken, name}` → `Id<"players">` | `NAME_TAKEN` carries the existing `playerId` so the UI can highlight the chip. Rate limit `joinGroup`. An Account caller claims the new Player (§12) |
| | `claim` | mutation | `{shareToken, playerId}` → `null` | Account only. Moves the caller's claim in this Group to the Player. `PLAYER_CLAIMED` if another Account holds it. Rate limit `claimPlayer` |
| | `release` | mutation | `{groupId}` → `null` | Account only. Clears the caller's claim in that Group, if any. Rate limit `claimPlayer` |
| | `answer` | mutation | `{shareToken, playerId, date, answer: Answer \| null}` → `null` | Upsert, or delete on `null`. Rate limit `answer`. Touches the Group |
| | `fillRest` | mutation | `{shareToken, playerId, month}` → `null` | Writes `busy` to every unanswered bookable date of the month in one mutation |
| `me` | `groups` | query | `{today}` → `MyGroups \| null` | Account only, `null` otherwise. The Groups the caller runs and the Groups where it has a Claimed Player, with upcoming Sessions as of `today` (§12) |
| `account` | `me` | query | `{}` → `{isAnonymous, email} \| null` | |
| | `startSave` | mutation | `{}` → `{code}` | Anonymous GM only. 32 random bytes, stored hashed, 10-minute TTL. Rate limit `startSave` |
| | `finishSave` | mutation | `{code}` → `{groupIds}` | Account only. See §5.3 |
| `auth` | `signIn`, `signOut`, `store` | Convex Auth | | |

Internal: `groups.deleteChildren`, `cleanup.sweepExpiredGroups` (cron), `rateLimits` component setup in `convex/convex.config.ts` and limit definitions in `convex/model/rateLimits.ts`.

Dropped from Lonir: workspace functions, `gmGetGroupRail` and `gmGetDateAvailability` (the client derives the rail counts and the day panel from `groups.mine` and `schedule.month`), `listSessions`, `getAvailability`, `claimMembership` (a client-only check against `player.group`), early access, consent, client errors, hand-off, activation telemetry.

## 5. Authentication and authorization

### 5.1 Who can do what

| Caller | Can |
| --- | --- |
| Anyone | `player.group`, `player.answers`, `player.join`, `player.answer`, `player.fillRest` with a valid Share Token, within rate limits. `auth.signIn` with `anonymous` or a `password` sign-up (both rate limited), or a `password` log in (Convex Auth's throttle) |
| Anonymous GM or Account | Everything in `groups`, `schedule`, `roster`, `sessions` for Groups they own. Nothing on Groups they do not own: those look missing |
| Anonymous GM only | `account.startSave` |
| Account only | `account.finishSave`, `auth.signOut` from the UI (an Anonymous GM has no sign-out button, because signing out would lose the Group), `player.claim`, `player.release`, `me.groups` |

The Share Token is the only Player credential ([ADR-0004](adr/0004-share-token-is-the-player-credential.md)); a claim does not change that ([ADR-0010](adr/0010-accounts-claim-players-share-token-still-answers.md)). Anyone with the link can answer as any Player; that is the accepted risk Lonir also took (Lonir ADR-0077). Player identity lives in `localStorage` under `next-session.players`, a map of `groupId → {playerId, name}`, so it survives a token rotation. On load the client checks the remembered Player against `player.group` and forgets it if the GM removed that Player. For a signed-in Account, `claimedPlayerId` wins over the remembered Player (§12).

### 5.2 Create your link

1. The client calls `signIn("anonymous")`.
2. The custom `anonymous` provider (a `ConvexCredentials` provider, about 20 lines, modelled on Convex Auth's `Anonymous`) consumes the global `anonymousSignUp` limit through `ctx.runMutation`, then creates the user with `isAnonymous: true` and the current Legal Acceptance stamps from `shared/legal.ts`.
3. `callbacks.afterUserCreatedOrUpdated` sees a new anonymous user and inserts the first Group ("My group", fresh token, `expiresAt`) in the same mutation. The user, the Group, and the Legal Acceptance commit together or not at all.
4. The client reads `groups.mine` and shows the Share Link in place of the button.

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

`gmEdit` covers every GM mutation without a limit of its own: `groups.rename`, `remove`, `rotateShareToken` and `undoRotateShareToken`, all of `roster` and `sessions`, and `account.finishSave`. It is sized so that no real GM reaches it.

`answerPerGroup` spreads a Group's taps over 10 limiter rows, so Players tapping at once do not conflict on one row. Each tap draws from the fuller of two random shards, so a burst can be refused a little before all 300 tokens are spent.

A hit throws `RATE_LIMITED` with `retryAfter`; the UI shows "Slow down a moment" and reverts the optimistic change.

### 5.5 Expiry of Unsaved Groups

`crons.ts` runs `cleanup.sweepExpiredGroups` daily at 03:17 UTC. It reads `by_expiresAt` for `0 ≤ expiresAt < now` in pages of 50, deletes each Group the same way `groups.remove` does, and reschedules itself while pages remain. The GM surface shows the date ("Saved for 30 quiet days, until Nov 1"), and the Terms and the Privacy Policy say it ([ADR-0006](adr/0006-unsaved-groups-expire-after-30-quiet-days.md)).

### 5.6 Session lifetime

A session lasts 1 year from sign-in (`session.totalDurationMs`), and `session.inactiveDurationMs` is the same year, so a GM who stays away keeps the session until the year is up. After the year, an Account logs in again; an Anonymous GM loses access to its Groups, which is the reason to Save.

Player answers keep an Unsaved Group alive without refreshing the GM's session. A shorter inactivity limit would lock an Anonymous GM who stays away out of a Group that lives on while the Players keep answering. The year costs no storage, because Expiry still deletes the anonymous user with its last Group (§5.5).

Convex Auth's default is 30 days in total, which would lock out an active Anonymous GM after a month, Groups and all.

## 6. Frontend

### 6.1 Routes

| Route | Search params | Screen | Guard |
| --- | --- | --- | --- |
| `/` | | Landing with Create your link; the link-created moment in place | A GM with Groups is redirected to the last visited Group (or the first). An Account without Groups of its own is redirected to `/me` |
| `/g/$groupId` | `month` (YYYY-MM), `day` (YYYY-MM-DD) | GM group surface | Signed out → `/`. Missing or foreign id → the first Group, without an error boundary |
| `/s/$shareToken` | `month` | Player join, then the player calendar; not-found for an unknown token | None. A signed-in Account with a Claimed Player in the Group skips Join |
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
    group/              GroupScreen container; calendar/ (HeatCalendar, DayPanel); rail/ (GroupSwitcher,
                        BestNights, Players, Sessions, Nudge)
    player/             PlayerScreen, Join, PlayerCalendar, Progress, playerMonth.ts, KeepGroup
    me/                 MyGroups (§12)
    legal/              LegalPage, rendered from docs/legal/*.md
  lib/                  env.ts, pageTitle.ts, storage.ts (all localStorage keys, prefixed "next-session."), errors.ts,
                        keyboard.ts
shared/                 dates.ts, answers.ts, monthSummary.ts, names.ts, shareToken.ts, legal.ts, limits.ts
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
| `src/features/account/save.ts` | `saveGroups({email, password, mode}, deps)` and `resumePendingSave(deps)` | Vitest with a fake `deps` (`startSave`, `signIn`, `finishSave`, storage). The real adapter wraps Convex |
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
- `e2e`: start a local Convex backend with `CONVEX_AGENT_MODE=anonymous bunx convex dev` (verified headless on CLI 1.46.0: it downloads the backend, serves `http://127.0.0.1:3210`, and needs no Convex login), set the Convex Auth env vars on it, start `vite`, run Playwright. Upload the report on failure.

### Deploy from `main`

The same workflow runs on `push` to `main`; a `deploy` job `needs: [check, e2e]` with `concurrency: deploy-production`:

1. `bunx convex deploy --cmd 'bun run build' --cmd-url-env-var-name VITE_CONVEX_URL` with `CONVEX_DEPLOY_KEY`.
2. `bunx wrangler deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Smoke: `curl https://next-session.link`. The app, a deep link and a new Share Link answer 200; a legacy `/s/<8 chars>` and a `/groups/...` link answer 302 to the same path on Lonir.

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
7. The GM deletes the Group (test data cleanup).

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
| 3 | Joining with a new name while signed in as an Account claims the new Player. Picking an existing name claims only through **Keep this group** | Claim on every pick, which lets a GM previewing their own link claim their Players' names |
| 4 | A claim does not lock answering: the Share Link still answers as any Player (ADR-0004 stands) | Claimed Players answer only through their Account |
| 5 | One Claimed Player per Account per Group; claiming another Player there moves the claim | Several per Group, for a parent who answers for two kids |
| 6 | Claiming another Account's Player throws `PLAYER_CLAIMED`; the GM removes a squatter | A GM "release claim" action on the Roster |
| 7 | Only Accounts claim. **Keep this group** from an Anonymous GM's browser runs Save first, then claims | Let Anonymous GMs claim and move their claims on Save |
| 8 | **Not you?** on a Claimed Player releases the claim | **Not you?** switches only on this device and keeps the claim |
| 9 | Players never leave a Group. **Remove from my groups** releases the claim; only the GM removes a Player (Michael's rule) | A Player can delete themselves |
| 10 | Rotating the Share Token keeps Claimed Players in: My groups returns the current token | Rotation releases every claim of the Group |
| 11 | My groups lists Groups and Sessions. Answering stays on the existing player page, reached through `/s/<token>` | An inline multi-Group calendar on `/me` |
| 12 | The landing sends an Account without Groups of its own to `/me`. A GM still lands on their last Group, with a **My groups** link in the header | Every Account lands on `/me` |
| 13 | A Player's name stays per Group. There is no Account display name | An Account name prefilled into Join |
| 14 | The Privacy Policy gains one row and becomes 1.1. No re-acceptance gate: the new processing happens only when someone keeps a Group, and creating the Account stamps 1.1 | Build the re-acceptance gate first |
| 15 | Email notifications are specified as a hook (§12.6) and not built | Build Resend sending now |

### 12.2 Who sees what

| Caller | On `/s/<token>` | On `/me` |
| --- | --- | --- |
| Visitor without a session | Today's flow: pick or type a name, tap days. A **Log in** link in the header and a quiet **Keep this group** line under the calendar | Redirected to `/` |
| Anonymous GM | Today's flow. **Keep this group** runs Save, then claims | Redirected to their Group |
| Account | Opens as the Claimed Player when it has one in this Group, on any device; otherwise Join, where a new name is claimed at once | Their Groups and Sessions |

### 12.3 Backend

Schema: `players.userId` and `by_userId_and_groupId` (§3). The field is optional, so existing rows need no migration. Invariant 9 in §3 holds the rules.

- `currentAccount(ctx)` and `requireAccount(ctx)` in `convex/model/access.ts` return the signed-in user only when it is not anonymous.
- `claimedPlayerIn(ctx, accountId, groupId)` and `claimPlayer(ctx, account, player)` in `convex/model/players.ts`. `claimPlayer` is a no-op when the Account already holds the Player, throws `PLAYER_CLAIMED` when another Account does, and throws `TOO_MANY_GROUPS` at the 50th claim unless it moves a claim within the Group. Otherwise it clears the Account's earlier claim in the Group and sets `userId`.
- `player.group` adds `claimedPlayerId`, read through `by_userId_and_groupId`. It is `null` for visitors and Anonymous GMs.
- `player.join` inserts the Player, then calls `claimPlayer` when the caller is an Account. A refused claim refuses the whole join, so a Player is never inserted half-done.
- `player.claim({shareToken, playerId})` checks the Player against the token with `playerOnShareLink`, then calls `claimPlayer`. `player.release({groupId})` clears the caller's claim in that Group and returns `null` whether one existed or not, so it cannot probe Groups.
- `me.groups({today})` returns `null` for anyone but an Account, else:

```ts
type MyGroups = {
  running: { groupId: Id<"groups">; name: string; upcomingSessions: IsoDate[] }[];
  playing: {
    groupId: Id<"groups">;
    name: string;
    shareToken: string;
    playerId: Id<"players">;
    playerName: string;
    upcomingSessions: IsoDate[];
    openDates: number;
  }[];
};
```

`today` is the client's UTC date from `useTodayUtc`, so the subscription reruns at midnight even when nothing is written; a Session that just passed drops out and `openDates` shrinks without a database change. The server accepts `today` only within one day of its own UTC date and otherwise uses its own, so a wrong clock cannot widen the Booking Window. A test changes `today` across midnight with no write in between and sees both values move.

`upcomingSessions` are the first five Session dates from `today` on, read as an index range on `by_groupId_and_date`. `openDates` is the number of bookable dates from `today` to the end of the Booking Window minus the Claimed Player's Answers in that range, read on `by_playerId_and_date`. A Group the Account runs and plays in shows in both lists. A claim whose Group was deleted while `groups.deleteChildren` is still running is skipped.

Every read is bounded. Running Groups come from `by_ownerId` with `.take(50)`; invariant 7 holds that cap, now also on Save (§5.3). Playing Groups come from `by_userId_and_groupId` with `.take(50)`, the claim cap. Per running Group: the Group and at most 5 Sessions. Per playing Group: the Group, the Player, at most 5 Sessions, and at most 92 Answers. The worst case is 50 × 6 + 50 × 99, about 5,300 documents, inside Convex's per-query read limits. An Account already above 50 Groups from a Save before this change sees its oldest 50 here; the GM surface still lists them all.

Unchanged: `roster.removePlayer` deletes the Player with its Answers, so the claim goes with the row; `groups.remove` and Expiry delete Players in batches the same way. Deleting an Account stays out of v1.

### 12.4 Player page

- **Header.** A small account control: **Log in** for a visitor, the email with **Log out** and **My groups** for an Account, nothing new for an Anonymous GM.
- **Auto-open.** When `claimedPlayerId` is set, the page skips Join, opens the calendar as that Player, and writes it to `next-session.players`.
- **Keep this group.** A quiet line under the calendar, never a modal and never before the first tap: "Keep this group on all your devices." Hidden once the caller holds this Player; then the line reads "Kept in My groups".
  - An Account: one tap calls `player.claim`.
  - A visitor: the Account sheet opens with **Create account** first and **Log in** second, with the legal line. After sign-in, the client claims.
  - An Anonymous GM: the sheet runs Save (§5.3), then claims.
  - The client writes `next-session.pendingKeep` (`{shareToken, playerId}`) to `sessionStorage` before signing in and clears it after the claim, or on `PLAYER_CLAIMED` or `NOT_FOUND`. App start retries a leftover keep once an Account is signed in, which covers a dropped connection and Google's OAuth redirect (#58) alike.
- **Join while signed in** claims the new name and confirms with a toast: "Kept in My groups".
- **Not you?** on a Claimed Player calls `player.release`, then shows Join.
- **`PLAYER_CLAIMED`** reads "Another account keeps this name. Add yours with a last initial, or ask your GM."

The no-account path keeps its steps and its fields: Join shows no new prompt, and nothing asks for an Account before the first answer.

### 12.5 My groups (`/me`)

- **Next sessions** on top: every upcoming Session across both lists, merged by date, each with its Group name, the next five shown.
- **You play in:** a card per Claimed Player with the Group name, the Player name, the next Session, and "N days to answer" while `openDates > 0`. The card opens `/s/<token>`, which opens as the Claimed Player. A menu offers **Remove from my groups**, with Undo through `player.claim`.
- **You run:** a card per Group with its next Session, opening `/g/<groupId>`.
- **Empty:** "Open your GM's link and tap Keep this group", plus Create your link.
- **Log out** in the header. The GM surface's header gains a **My groups** link for Accounts.

### 12.6 Email notifications: the hook, not built

Resend's DNS records are already on the zone. When this is built:

- Triggers: `sessions.schedule` and `sessions.unschedule` schedule `internal.notifications.sessionChanged({groupId, date, change})` with `ctx.scheduler.runAfter(0, …)`, so the GM's mutation never waits on email.
- Recipients: the Accounts behind the Group's Claimed Players, read through `players.by_groupId_and_nameKey` and `userId`, except the Account that made the change. Visitors without an Account get nothing; that is the reason to keep a Group.
- Needs, then: `@convex-dev/resend`, a `RESEND_API_KEY` from Michael, a per-Account opt-out field on `users`, an unsubscribe link, a verified email (Google's is verified; Password needs a verification step or Resend OTP first), and a Privacy Policy row.

### 12.7 Legal

`docs/legal/privacy.md` gains one row in the data table: "For a player with an account: which player in which group belongs to your account, to show your groups on any device", and `LEGAL_VERSIONS.privacy` becomes `"1.1"` with a new effective date. The Terms already say Players need no account and need no change.

### 12.8 Test seams

| Seam | Tested through |
| --- | --- |
| `player.join`, `player.claim`, `player.release`, `player.group`, `me.groups`, `account.finishSave` | `convex-test` through `api.*` with `t.withIdentity` for an Account and an Anonymous GM. Invariant 9 and every row of §12.2 has a test, including: a joined Player stays until `roster.removePlayer`; release keeps the Player and its Answers; a removed Player leaves My groups; a rotated token still shows in My groups; `today` moving across midnight without a write changes `upcomingSessions` and `openDates`; a Save past 50 Groups moves nothing |
| `src/features/account/keep.ts` | Vitest with fake `deps`, as `save.ts` |
| `Join`, `PlayerCalendar`, `MyGroups` views | Testing Library: props in, callbacks out |
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
| 12 | PostHog Workflows sends the mail. It can: a webhook trigger guarded by a secret `Authorization` header, delays up to 30 days per step, email steps, message categories with a hosted unsubscribe page, and a verified sender domain. Only Convex starts a mail workflow: the project token is public, so a workflow triggered by a captured event would mail any address anyone posts | Resend from Convex scheduled functions, the §12.6 hook. Kept for Session notifications, which fan out to many recipients (§13.7) |
| 13 | Every new Account gets one **Welcome Mail** (transactional, no promotion) | No mail at all until notifications ship |
| 14 | The drip is **Tips**: two mails, only for Accounts that tick an unticked box in the Save sheet and then press **Yes, send me the tips** on the page the Welcome Mail links to (double opt-in). Opening the link alone confirms nothing, so a mail scanner cannot subscribe anyone | Single opt-in, or treat the tips as service messages without consent. German law (§ 7 UWG) reads usage tips as advertising, and double opt-in is how consent is proven |
| 15 | Email open and click tracking are off on every step (`tracking_enabled: false`) | Turn them on, which puts a tracking pixel in a mail and needs consent of its own |
| 16 | Test Accounts never get mail: Convex requests no mail for a `.test` address, their events carry `is_test_account: true`, and the production spec signs up with `@example.test` instead of `@next-session.link` (whose mail would bounce and cost sender reputation) | Rely on the project's test-account filter, which Lonir owns |
| 18 | Mail requests are durable: Convex sends them through `@convex-dev/action-retrier`, which retries network errors and 5xx answers with backoff. Analytics events stay best-effort and are dropped on failure | Retry analytics too, which costs function calls for numbers nobody misses |
| 19 | An objection is enforced, not just promised: `users.analyticsObjectedAt` stops every server event for that Account, and `/privacy` gets **Turn off usage measurement in this browser**, which calls `posthog.opt_out_capturing()` | Promise objection by email and handle it by hand in PostHog, where deleted persons come back with the next event |
| 17 | The Privacy Policy gains the analytics, error and mail sections and bumps its minor version. No re-acceptance gate: analytics run on legitimate interest, and Tips need their own consent anyway | Build the re-acceptance gate first (§6.3) |

### 13.3 Consent and privacy

The operator is in Germany, so two laws apply: § 25 TDDDG for anything read from or stored on the device, and the GDPR for every personal datum.

- **No device storage, minimal device reads.** `cookieless_mode: "always"` never writes PostHog state to a cookie, `localStorage` or `sessionStorage`. § 25 TDDDG also covers reading from the device, so `before_send` drops what the SDK reads through JavaScript beyond what every HTTP request already carries: `$screen_height`, `$screen_width`, `$viewport_height`, `$viewport_width`, `$timezone`, `$timezone_offset`, `$browser_language` and `$browser_language_prefix`. What remains is the URL, the referrer and what PostHog derives from the user agent. PostHog counts unique visitors with a daily-salted server-side hash of IP and user agent, which it does not store. Michael enables "Cookieless server hash mode" in the shared project's web analytics settings once; it changes nothing for Lonir's SDK, which does not use cookieless mode.
- **Legal basis.** Pseudonymous, first-party product analytics and error reports on legitimate interest (Art. 6(1)(f) GDPR): keep the Service working and find out which steps people use. No cross-site tracking, no profiling across products (call 6), no advertising, and an objection stops it: the button on `/privacy` for the browser, and `users.analyticsObjectedAt` (set on an emailed objection) for an Account's server events.
- **IP addresses.** The project's "IP data capture" setting must read "discard". EU organizations default to it; the switch-on ticket checks it and asks Michael before changing a setting Lonir shares.
- **What the browser never sends.** `before_send` (events) and `logs.beforeSend` (log records, which carry `url.full` on their own pipeline) pass every string value that is a URL or a path on the app's origin through one pure function, `redactUrl`, so `$current_url`, `$pathname`, `$referrer`, `$session_entry_url`, `$initial_*` and `url.full` are all covered without a list to keep current: a Share Token path becomes `/s/:shareToken`, and the query keeps only `month` and `day`. That also drops the OAuth `code` (#58) and the Tips `code`. Autocapture is off, so no element text (Player and Group names) leaves the page. Exception messages from our code carry codes, not names.
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
- `LEGAL_VERSIONS.privacy` goes up one minor version (1.2 if #64's 1.1 lands first, else 1.1, and #64 takes the next) with a new effective date.

### 13.4 Browser

`src/lib/telemetry.ts` is the only module that imports `posthog-js`. Everything else calls it.

```ts
// src/lib/telemetry.ts (interface)
export type BrowserEvent =
  | { name: "share_link_copied"; surface: "landing" | "rail" | "compact"; method: "clipboard" | "fallback" | "failed" }
  | { name: "share_link_shared"; surface: "landing" | "rail" | "compact"; channel: "whatsapp" | "telegram" | "mail" | "native" }
  | { name: "fill_rest_used"; group_id: string }
  | { name: "answers_started"; group_id: string } // once per page load, at the first saved tap
  | { name: "save_started" }
  | { name: "sign_in_failed"; flow: "signUp" | "signIn"; code: string }
  | { name: "keep_group_started"; group_id: string };

export function initTelemetry(source?: EnvSource): void; // no-op without VITE_POSTHOG_TOKEN
export function track(event: BrowserEvent): void; // sends `next_session:<name>`
export function log(level: "info" | "warn" | "error", body: string, attributes?: Record<string, string | number | boolean>): void;
export function reportError(error: unknown, context: { surface: string }): void;
export function redactUrl(url: string): string; // pure
```

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
  advanced_disable_flags: true,
  logs: {
    serviceName: "next-session-web",
    environment: "production",
    serviceVersion: release,
    resourceAttributes: { product: "next-session" },
    beforeSend: redactLog, // redactUrl on url.full and every attribute
  },
  before_send: redactEvent, // redactUrl on every URL-valued property, drops device reads (§13.3)
});
posthog.register({ product: "next-session" });
```

`release` is the commit SHA, passed as `VITE_RELEASE` by the deploy job, so exceptions, logs and source maps share a version. Pin `posthog-js` (1.438.1 today) like every other dependency.

- **Errors.** `capture_exceptions` covers uncaught errors and unhandled rejections. `createRoot` gets `onUncaughtError` and `onCaughtError`, which call `reportError`, and the root route gets an `errorComponent` that reports and renders the not-found card's sibling ("Something broke. Reload the page."). `src/lib/errors.ts` reports a Convex failure only when it has no `ErrorCode`: expected codes like `RATE_LIMITED` are product flow, not errors. The report carries the function name and the `[Request ID: …]` Convex puts in the message, which finds the server log in the Convex dashboard.
- **Source maps.** `@posthog/rollup-plugin` in `vite.config.ts`, active only when `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` are set, with `releaseName: "next-session-web"`, `releaseVersion` the commit SHA, and `deleteAfterUpload: true`, so no map reaches `dist/`. The deploy job sets them; `bun run check` and local builds do not, and build without maps as today.
- **Objection.** The `/privacy` page renders **Turn off usage measurement in this browser** (or **Turn it back on**) while telemetry is enabled; it calls `posthog.opt_out_capturing()` / `opt_in_capturing()`, which PostHog keeps in `localStorage` at the visitor's request.
- **Logs.** `log()` wraps `posthog.logger`. First uses: Save recovery on app start (§5.3 step 5: resumed, `CLAIM_INVALID`), a leftover Keep this group retry (§12.4), and the Copy fallback (#54: clipboard refused, `execCommand` used, both failed). Console capture stays off: `console.*` carries whatever a library prints.
- **Proxy.** `worker/index.ts` adds `ingestTarget(url) → string | null`: `/ingest/static/*` and `/ingest/array/*` go to `eu-assets.i.posthog.com`, the rest of `/ingest/*` to `eu.i.posthog.com`. The Worker strips `cookie` and `set-cookie`, sets `X-Forwarded-For` from `CF-Connecting-IP` (else every visitor hashes to one Cloudflare IP), and returns 204 without forwarding when the request carries no PostHog path. `wrangler.jsonc` adds `/ingest/*` to `assets.run_worker_first`. Worker requests count toward the free 100,000 per day; posthog-js batches, so a visit costs a handful.

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
  | { name: "session_unscheduled"; actor: Actor; group_id: string }
  | { name: "share_link_rotated"; actor: Actor; group_id: string }
  | { name: "tips_confirmed"; actor: Actor };

type Actor = Doc<"users"> | { playerId: Id<"players"> };

export async function track(ctx: MutationCtx, event: ServerEvent): Promise<void>;
export async function serverLog(ctx: MutationCtx, level: "info" | "warn" | "error", body: string, attributes: Record<string, string | number | boolean>): Promise<void>;
```

- `track` returns at once when `process.env.POSTHOG_PROJECT_TOKEN` is unset or the actor is an Account with `analyticsObjectedAt`, so tests and the local backend schedule nothing. Otherwise it builds the PostHog payload and calls `ctx.scheduler.runAfter(0, internal.telemetry.send, { events, logs })`. The scheduled call commits with the mutation, so a refused mutation sends nothing and a committed fact is sent once.
- The payload, built in one pure function `toPostHogEvent(event, now)` that the tests pin: event name `next_session:<name>`; `distinct_id` `next-session:<users._id>` for a user, `next-session:player:<playerId>` for a Player without an Account; properties `product: "next-session"`, the event's fields, `$process_person_profile: false` unless the actor is an Account, and `is_test_account: true` for an email under `.test`. No event carries an email address, and no event sets person properties beyond `next_session_account: true` on `account_created`.
- `internal.telemetry.send` is a default-runtime action: one `fetch` to `https://eu.i.posthog.com/batch/` for events, one to `https://eu.i.posthog.com/i/v1/logs` with an OTLP/JSON body for logs (`resource.attributes` `service.name: next-session-convex`, `product: next-session`), both with the project token. A failed send is logged to the Convex console and dropped; telemetry never retries into a user's mutation.
- Call sites, one line each, after the write succeeds: `auth.ts` `afterUserCreatedOrUpdated` (`link_created` for a new Anonymous GM; `account_created` for a new Account, any provider), `groups.create`, `account.finishSave`, `player.join` / `claim` / `release`, `sessions.schedule` / `unschedule`, `groups.rotateShareToken`. The Expiry sweep (§5.5) calls `serverLog` once per run with the number of Groups deleted. Answers are not tracked on the server: taps are the high-volume path, and each `track` costs one action call out of Convex Free's 1M a month.
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
2. Sign-up passes `tips: "yes"` in the Password params. The profile stores `tipsRequestedAt` and `tipsConsentVersion: "1"` (the box's wording, kept in `shared/tips.ts`). `afterUserCreatedOrUpdated` requests the Welcome Mail for every new Account; for a ticked box it first mints a 32-byte code, stores its SHA-256 as `tipsCodeHash` (the `saveClaims` pattern), and passes `tipsConfirmUrl: https://next-session.link/tips?code=<code>`. Google sign-up (#58) has no box.
3. The Welcome Mail shows the confirmation block only when the trigger event has `tips_confirm_url`. #79 checks with `workflows-test-run` that the email step's Liquid reads the trigger event.
4. `/tips?code=…` reads nothing on load except the code from the URL, then removes it from the address bar. It shows the box's wording and one button, **Yes, send me the tips**. Only the press calls `account.confirmTips({code})`: it finds the user by hash within 3 days of `tipsRequestedAt`, sets `tipsConfirmedAt`, clears the hash, tracks `tips_confirmed`, and requests the Tips workflow. It returns `{confirmed: boolean}` and needs no session, because the code proves the inbox. A new global rate limit `confirmTips` (token bucket, 30 per minute, capacity 60) keeps it from being used to guess codes, on top of the 256-bit code. After the press the page says "Done. The first tip arrives in two days." or "This link has expired. That's fine, you'll just get no tips."

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
> - Plans changed? **Unschedule** it, and Undo is there if you slip.
>
> That's the last tip from me. Have a great game night 🎲
>
> [Open My groups](https://next-session.link/me)
>
> Thanks!
> Michael
>
> You get this because you asked for tips. [Unsubscribe]({{ unsubscribe_url }})

### 13.7 How this fits the §12.6 email hook

Session notifications stay on the §12.6 plan: Resend from a Convex action. A Session change mails every Claimed Player's Account except the one who made it, and a PostHog workflow runs per person and per event, so it would need one event per recipient and would put every Player's email into PostHog. The two paths share the sending domain (`next-session.link`) and the opt-out rule: when notifications ship, their opt-out lives on `users`, not in PostHog.

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
| `account.confirmTips` | `convex-test`: a valid code within 3 days confirms once, tracks `tips_confirmed` and requests the Tips workflow; a reused, unknown or late code returns `confirmed: false` and requests nothing |
| `src/lib/errors.ts` reporting | Vitest: a Convex error without a code is reported with the request ID; a coded error is not |
| The Save sheet box, the `/tips` page, the `/privacy` opt-out | Testing Library: the box is unticked by default and the sign-up params carry `tips` only when ticked; rendering `/tips` calls nothing, and only the button press calls `confirmTips`; both outcomes; the opt-out toggles `opt_out_capturing` |
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
