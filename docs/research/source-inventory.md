# Source inventory: Next Session in `Omni-GM/lonir`

Last reviewed: 2026-10-02
Ticket: [#2](https://github.com/Silthus/next-session/issues/2), map [#1](https://github.com/Silthus/next-session/issues/1)
Source: `Omni-GM/lonir` at `824bd52` (2026-08-23), read-only clone at `/tmp/lonir`. Every path below is relative to that repo root. Line counts are `wc -l`.

## Answer

Next Session is a small, self-contained scheduling product inside a large game-management monorepo. A GM owns **Groups**. Each Group has a roster of **Memberships** (players, name only), a per-player per-day **Availability** poll (`yes` / `maybe` / `no` / unanswered), and **Sessions** (a picked date). Players never sign in. The GM hands out one **Share Link** (`/s/:shareToken`), which is the only credential on the player surface; the browser remembers which roster name the player picked in a cookie.

The scheduling core is already almost free of Lonir:

- `memberships`, `availability` and `sessions` are keyed by `groupId` only.
- The pure logic lives in `packages/schedule` (974 source lines, no React, no Convex).
- The player backend (`unauthenticated/playerSchedule.ts`, 323 lines) has no Lonir imports beyond the `forbidden` error helper.

The Lonir coupling sits in a ring around that core:

- `groups.workspaceId` and the group-authority wrapper's workspace fallback.
- Workspace minting on sign-up.
- The early-access gate and its waitlist leads.
- Server-side PostHog activation telemetry and the consent mirror that gates it.
- The dead cross-origin hand-off.
- `sessions.sessionEntityId`, which links a scheduled date to a Lonir prep entity.
- Lonir-branded legal text.
- The `@omnigame/*` telemetry, errors, data and env packages.

The port keeps the core, rewrites the ring, and drops Lonir's growth and analytics machinery.

Sizes, for planning:

| Area | Source lines | Test lines |
| --- | --- | --- |
| `apps/nextsession/src` (excluding `routeTree.gen.ts` and stories) | 4,161 | 4,942 |
| `packages/schedule/src` | 974 | 1,004 |
| `packages/ui/src/components/schedule` | 3,231 | 2,334 (plus 13 stories) |
| `packages/compliance/src` | 988 | ~1,350 |
| Backend scheduling surface (functions and helpers listed in §3) | ~3,240 | ~6,900 |
| `apps/web-e2e/tests/standalone-*.spec.ts` | n/a | 842 |

## 1. Domain terms

These come from `CONTEXT.md` (Lonir glossary, lines 31-125 and 711-735). Each line notes what to do with the term in the port.

- **Group** (`CONTEXT.md:39`). A stable roster: one GM and many players. Lonir says it is "Workspace-scoped". Since map #4682 it is owner-scoped with an optional workspace link. *Port, owner-scoped only.*
- **Membership** (`:43`). A roster entry with a `name`. The schema also carries `userId?` and `role?: 'gm' | 'player'`, but scheduling never writes `userId` and never writes `role: 'gm'`. *Port as name-only.*
- **GM / Player** (`:52`, `:56`). Roles. In practice the GM is the group owner (a `users` row) and players are memberships. *Port the roles; there is no role column.*
- **Availability** (`:107`). One row per (`membershipId`, `dateISO`) with state `yes|maybe|no`. A missing row means unanswered. The UI labels are Free / Maybe / Busy. A past date is read-only. The booking window runs from the current month to the current month + 2. *Port.*
- **Scheduled Session** (`:79`). At most one `scheduled` row per group per date. Lonir separates it from the **Session** entity, which is prep content. *Port as "Session". Drop the entity link.*
- **Share Link** (`:113`). `…/s/:shareToken`. The token is 8 characters from a 64-character URL-safe alphabet, and it is the only player credential. Rotating it invalidates every old link. *Port.*
- **Anonymous Player** (`:103`). The glossary still describes the Convex anonymous session and `membershipClaims` table. ADR-0077 superseded both: the player is cookie-only. *Port the cookie model. Ignore the stale glossary text.*
- **GM Schedule / Player Schedule / Player Filter** (`:117-125`). The two surfaces and the GM's URL-backed player subset filter. *Port.*
- **Top Days**. Dates ranked by `yes − 2·no + 0.5·maybe` (`packages/schedule/src/perPlayerAggregate.ts:77`). *Port.*
- **Hand-off** (ADR-0173). A one-time `?handoff=` code that carried a Lonir session to `next-session.link`. ADR-0178 (`docs/adr/0178-provisioned-convex-origin-with-path-mounted-next-session.md:31-48`) superseded it: both apps share one origin and "the product no longer mints new hand-off codes". *Drop.*
- **GM tutorial / Player tutorial**. A first-run dialog: copying the share link for the GM, "how does this work" for the player. Dismissal is stored client-side. *Port.*
- **Early-Access Gate / Pending / Lead / Unlock** (`CONTEXT.md:711-735`, ADR-0152). Lonir's launch funnel: a PostHog feature flag, waitlist leads, and admin unlocks. *Drop.*
- **Legal Documents / clickwrap acceptance** (`:35`, ADR-0160). Terms, Privacy and Imprint, accepted once after sign-in with stored versions and a timestamp. *Redesign: keep the mechanism, rewrite the content.*
- **Consent Banner** (`:31`). Gates PostHog analytics. *Drop together with analytics; see call C3.*

## 2. Data model (Convex schema)

Everything below is in `packages/backend/convex/schemaCore.ts`.

### `groups` (`:745-768`)

| Field | Type | Verdict |
| --- | --- | --- |
| `workspaceId` | `v.optional(v.id('workspaces'))` | **Drop.** Lonir link, read by prep, debriefs and milestones. |
| `ownerUserId` | `v.optional(v.id('users'))` | **Port, narrowed to required `v.id('users')`.** It is optional in Lonir only because of a backfill migration. |
| `name` | `v.string()` | Port |
| `shareToken` | `v.string()` | Port |
| `createdAt` | `v.number()` | Port. `_creationTime` could replace it; keep it only if ordering needs it. |

Indexes: `by_workspaceId_and_createdAt` (drop), `by_ownerUserId` (port), `by_shareToken` (port).

### `memberships` (`:781-788`)

| Field | Type | Verdict |
| --- | --- | --- |
| `groupId` | `v.id('groups')` | Port |
| `name` | `v.string()` | Port. It holds the display name. |
| `createdAt` | `v.number()` | Port |
| `userId` | `v.optional(v.id('users'))` | **Drop.** Never written by scheduling. |
| `role` | `v.optional('gm' \| 'player')` | **Drop.** Scheduling writes only `'player'`, and every read treats a missing value as `'player'`. |

Index: `by_groupId_and_createdAt` (port).

### `availability` (`:789-798`)

The fields are `groupId`, `membershipId`, `dateISO` (`YYYY-MM-DD` string), `state` (`yes|maybe|no`) and `updatedAt`. **Port all of them unchanged.**

The indexes are `by_groupId_and_dateISO` (GM aggregate), `by_groupId_and_membershipId` (roster delete) and `by_membershipId_and_dateISO` (player month read and upsert). Port all three.

### `sessions` (`:809-834`)

| Field | Type | Verdict |
| --- | --- | --- |
| `groupId` | `v.id('groups')` | Port |
| `scheduledFor` | `v.string()` (ISO date) | Port |
| `status` | `'scheduled' \| 'played' \| 'cancelled'` | **Redesign.** Scheduling writes only `'scheduled'`, and `unscheduleSession` deletes the row. `played` is written by Lonir debriefs and milestones. Drop the field, or keep a single literal. See call C5. |
| `scheduledByUserId` | `v.id('users')` | Port |
| `scheduledAt` | `v.number()` | Port |
| `sessionEntityId` | `v.optional(v.id('entities'))` | **Drop.** Lonir prep entity. |

Indexes: `by_group_and_scheduledFor` (port) and `by_group_and_scheduledFor_and_status` (port, or collapse into the first if `status` goes). `by_group_and_status_and_scheduledFor` serves the Lonir debrief scan (drop). `by_sessionEntityId` (drop).

### `users` (`:60-112`)

The table spreads `authTables.users` and adds Lonir columns.

- Port: `acceptedTermsVersion`, `acceptedPrivacyVersion` and `acceptedLegalAt`. They are the clickwrap evidence.
- Drop: `isAdmin` (`:62`, early access and admin), `diagnosticSharingEnabled`, `preferredChatLanguage`, `stripeCustomerId`, and `analyticsConsentGranted` / `analyticsConsentDecidedAt` (the server-side consent mirror).

### Other tables

- `authHandoffCodes` (`:134-139`, fields `userId`, `sessionId`, `codeHash`, `expiresAt`): **drop**, hand-off is dead.
- `waitlistSignups` (`:188`, early-access leads): **drop**.
- `membershipClaims`: already deleted by ADR-0077. Nothing to port.
- Convex Auth tables (`authTables`): **port**, they come with Convex Auth.

## 3. Backend functions

Wrappers used in Lonir:

- `authedQuery` / `authedMutation`: any signed-in, non-anonymous user.
- `workspaceQuery` / `workspaceMutation`: ADR-0015 workspace membrane plus a capability check.
- `groupQuery` / `groupMutation` (`auth/groupAccess.ts`, 243 lines). Resolves `groupId` from the args, then admits the caller if `group.ownerUserId === userId` **or** `group.workspaceId` is set and the caller passes the workspace check (`:38-55`). It then checks a capability (`group.read`, `group.write`, `schedule.read`, `schedule.write`) through Lonir's role table. It also accepts and strips a transitional `workspaceId` arg (`:13`, `:57-61`). Both "not found" and "no access" surface as an opaque 403.
- Plain `query` / `mutation`: public, used on the player surface.

**Port target for the wrapper:** an owner-only `groupQuery` / `groupMutation` that requires `group.ownerUserId === me` and keeps the opaque 403. The workspace fallback, the capability table and the transitional arg all drop.

### 3.1 Functions the Next Session app calls

| Function | File:line | Wrapper | Args → returns | Called from | Verdict |
| --- | --- | --- | --- | --- | --- |
| `groups.createGroupForUser` | `groups.ts:94` | authedMutation | `{name}` → group doc; mints a share token, sets `ownerUserId` | `useScheduleSidebar` (rail "new group") | **Port** |
| `groups.listGroupsForUser` | `groups.ts:143` | authedQuery | `{paginationOpts}` → page of groups via `by_ownerUserId` | `useGroups` (page size 25) | **Port** |
| `groups.getGroup` | `groups.ts:155` | groupQuery `group.read` | `{groupId}` → group doc. **Leaks `workspaceId`.** | `useGroup`, prewarm | **Port** (return a DTO) |
| `groups.renameGroup` | `groups.ts:164` | groupMutation | `{groupId, name}` → void. No trim or length check. | rail kebab | **Port** (add validation) |
| `groups.deleteGroup` | `groups.ts:176` | groupMutation | `{groupId}`. Batched teardown of memberships, availability, sessions and the group (`groups/deleteGroupTeardown.ts`, 155 lines, batch size 100); `_sweepDeletedGroupChildren` (35 lines) continues through the scheduler. | rail kebab | **Port** |
| `groups.rotateShareToken` | `groups.ts:208` | groupMutation | `{groupId}` → updated group, new token | share controls "Rotate" | **Port** |
| `groups.getByShareToken` | `groups.ts:234` | public query | `{shareToken}` → `{_id, name, workspaceId}` or `null` | `usePlayerLanding` | **Port** (drop `workspaceId` from the return) |
| `scheduleGm.gmGetGroupSchedule` | `scheduleGm/queries.ts:167` | groupQuery `schedule.read` | `{groupId, dateFrom, dateTo}` → `{dates, perPlayer, topDays, badges, upcomingSessions, historySessions}`. Rejects a range over 31 days or more than 100 players (422). | `useSchedule`, prewarm | **Port** |
| `scheduleGm.gmGetDateAvailability` | `scheduleGm/queries.ts:297` | groupQuery | `{groupId, dateISO}` → `{dateISO, members[]}` with per-member state including `unanswered` | `useSchedule` (selected day) | **Port** |
| `scheduleGm.gmGetGroupRail` | `scheduleGm/queries.ts:393` | groupQuery | `{groupId, monthISO}` → `{groupId, respondedCount, totalPlayers, nextSession}` | `useScheduleSidebar` (one query per group through `useQueries`) | **Port** |
| `scheduleGm.addPlayer` | `scheduleGm/roster.ts:25` | groupMutation | `{groupId, displayName}` → membershipId. No validation. | `AddPlayerForm` | **Port** (add validation) |
| `scheduleGm.renamePlayer` | `scheduleGm/roster.ts:52` | groupMutation (group resolved from the membership) | `{membershipId, displayName}` | `PlayerRowActions` / `PlayerRowKebab` | **Port** |
| `scheduleGm.removePlayer` | `scheduleGm/roster.ts:70` | groupMutation | `{membershipId}`. Deletes the player's availability, then the membership. | same | **Port** |
| `scheduleGm.scheduleSession` | `scheduleGm/sessions.ts:28` | groupMutation | `{groupId, dateISO, surface?}` → session. 422 for an invalid, past or out-of-window date; 409 if the date already has a session. Then calls `captureSessionScheduled`. | `useSchedule` (optimistic) | **Port** (drop `surface` and telemetry) |
| `scheduleGm.unscheduleSession` | `scheduleGm/sessions.ts:97` | groupMutation | `{sessionId}`. Hard-deletes the row. | `useSchedule` (optimistic) | **Port** |
| `playerSchedule.listMembershipsByShareToken` | `unauthenticated/playerSchedule.ts:267` | public query | `{shareToken}` → `[{_id, name}]` for players, or `[]` | picker | **Port** |
| `playerSchedule.selfAddPlayer` | `:246` | public mutation | `{shareToken, displayName}` → membershipId. **No server-side trim or length check**; only the client form trims. | `SelfAddPlayerForm` | **Port** (add validation) |
| `playerSchedule.claimMembership` | `:300` | public mutation | `{shareToken, membershipId}` → membershipId. Checks the membership belongs to the group and is a player; writes nothing. | picker | **Port** |
| `playerSchedule.listAvailabilityForMonth` | `:201` | public query | `{shareToken, membershipId, monthISO}` → `Record<dateISO, state>` | `usePlayerSchedule` | **Port** |
| `playerSchedule.setAvailability` | `:57` | public mutation | `{shareToken, membershipId, dateISO, state}`. Upsert; 422 for an invalid, past or out-of-window date. | tap (optimistic) | **Port** |
| `playerSchedule.clearAvailability` | `:96` | public mutation | `{shareToken, membershipId, dateISO}`. Deletes the row. | tap from `no` back to unanswered (optimistic) | **Port** |
| `playerSchedule.fillRestWithNo` | `:149` | public mutation | `{shareToken, membershipId, monthISO}`. Inserts `no` for every future unanswered day of the month. | "Fill rest" button | **Port** |
| `users.me` | `users.ts:13` | raw query | → user DTO incl. `mustAcceptLegal` (and Lonir fields) or `null` | `useLegalAcceptance` | **Redesign** (minimal DTO) |
| `users.acceptLegal` | `users.ts:45` | authedMutation | stamps current versions + `acceptedLegalAt` | `LegalAcceptanceGate` | **Port** |
| `earlyAccess.peekEntry` | `earlyAccess.ts:42` | authedQuery | → `{access, workspaceId: null}` | `useEntryAccess` | **Drop** |
| `earlyAccess.resolveEntry` | `earlyAccess.ts:57` | authedMutation | mints a workspace and the default group on a granted decision | `useEntryAccess` | **Drop** (replace with seeding the first group at sign-up, §3.3) |
| `consent.myAnalyticsConsent` / `recordAnalyticsConsent` | `consent.ts:46`, `:71` | query / authedMutation | server mirror of the analytics decision | `useAnalyticsConsentMirror` inside `ConsentGate` | **Drop** |
| `clientErrors.logClientError` | `clientErrors.ts` | mutation | production error sink | `main.tsx` | **Drop** (Lonir telemetry) |
| `auth.signIn` / `signOut` | `auth.ts` → `auth/provider.ts` (57 lines) | Convex Auth | Google, `handoff`, `test-user` | landing, hand-off, sign-out, test bridge | **Redesign** (§3.3) |

Facade modules: `scheduleGm.ts` (42 lines) re-exports `scheduleGm/*`. `playerSchedule.ts` (18) and its older duplicate `scheduleShare.ts` (22) both re-export `unauthenticated/playerSchedule.ts`. **Port one module; drop the duplicate facade.** `player.ts` (11) is unrelated: it is the static-hosting upload API for the player bundle.

### 3.2 Scheduling functions the app does not call

These are the GM surface's other backend functions, including what Lonir's old in-app schedule surface used.

| Function | File:line | Wrapper | What it is | Verdict |
| --- | --- | --- | --- | --- |
| `groups.createGroup` | `groups.ts:51` | workspaceMutation | Old Lonir path (workspace-scoped create). Still used by the nextsession hook tests to seed data. | **Drop** |
| `groups.listGroups` | `groups.ts:115` | workspaceQuery | Old Lonir workspace listing | **Drop** |
| `scheduleGm.gmGetGroupRailData` | `scheduleGm/queries.ts:354` | workspaceQuery | Old batched rail for the Lonir sidebar | **Drop** (`gmGetGroupRail` replaces it) |
| `scheduleGm.gmGetNextSession` | `scheduleGm/queries.ts:423` | workspaceQuery | Next session across a workspace's groups. Lonir dashboard and shell bar; only a prewarm test still references it. | **Drop**. If a "next session" badge is wanted later, rebuild it per owner. |
| `scheduleGm.listSessions` | `scheduleGm/sessions.ts:112` | groupQuery | `{upcoming, history}`. Superseded by `gmGetGroupSchedule`. | **Drop** |
| `playerSchedule.getAvailability` | `unauthenticated/playerSchedule.ts:126` | public query | Single-date read; no caller in the app | **Drop** |
| `auth/handoff.mintHandoffCode` / `consumeHandoffCode` | `auth/handoff.ts:143`, `:180` (210 lines) with `auth/providers/Handoff.ts` (44) | mutation / internal | Cross-origin hand-off, dead since ADR-0178 | **Drop** |
| `admin/scheduling.ts` | — | adminQuery | Lonir admin adoption metrics | **Drop** |

### 3.3 Auth, sign-up and provisioning

- **Providers** (`auth/provider.ts:18-22`): `Google` and `Handoff()`, plus `TestUser()` (29 lines) when `OMNIGAME_ALLOW_TEST_SIGNIN=1`. The module throws at load time if test sign-in is enabled in production. **Port Google and the dev-only test user, including the production guard. Drop Handoff.**
- **`callbacks.redirect`** → `resolveSignInRedirect` (`auth/redirect.ts`, 87 lines). Allows relative paths, `SITE_URL`-prefixed URLs and parsed-origin matches on `PLAYER_ORIGIN`, and rejects everything else (tested against `https://next-session.link.evil/`). **Redesign:** with one origin, only `SITE_URL` and relative paths remain. Keep the hostile-origin test.
- **`afterUserCreatedOrUpdated`**: on first sign-in, runs `resolveAndMintOnSignIn` (`earlyAccess/mint.ts`, 72 lines). That checks the early-access gate (`earlyAccess/resolveEarlyAccess.ts`, 98 lines: PostHog flag `early-access-gate`, `users.isAdmin`, unlocked waitlist lead). It then either mints a **workspace** whose seed calls `seedDefaultGroup` (`groups/seedDefaultGroup.ts`, 40 lines: `'My Group'` plus a share token), or records a gated lead. **Redesign:** on first sign-in, insert the default `'My Group'` owned by the user directly. No workspace, no gate, no lead.
- **Share token minting**: `groups/mintShareToken.ts` (37 lines) with `lib/shortId.ts`. nanoid `customAlphabet` over `A-Za-z0-9_-`, length **8**, up to 5 attempts, uniqueness checked through `by_shareToken`. That is 48 bits, enough for an unguessable group link at this scale. **Port.**
- **Legal versions on the backend**: `legal/versions.ts` (75 lines, `LEGAL_VERSIONS` and `requiresReacceptance`), duplicated client-side in `packages/compliance/src/legal/versions.ts` (terms 1.0, privacy 1.1, minimum accepted 1.0/1.0). A test holds the two copies together. **Port the mechanism.** Keep one source of truth if the new repo lets the client import from the backend package.
- **Activation telemetry**: `scheduleGm/activation.ts` (239 lines) emits `session_scheduled` through `captureConsentedPostHogEvent`, gated by the consent mirror. **Drop.**

### 3.4 Player identity

ADR-0077, `docs/adr/0077-cookie-only-player-identity.md`:

- No anonymous auth and no server-side claim. The share token is the credential; each mutation checks that the share token resolves to a group and the membership belongs to it (`assertMembershipBelongsToGroup`, `unauthenticated/playerSchedule.ts:18-34`).
- The picked membership is stored client-side in the cookie `omnigame_player` = JSON `{[shareToken]: {membershipId, displayName}}`, `Path=/s`, one-year `Max-Age`, `SameSite=Lax`, and `Secure` on https (`apps/nextsession/src/hooks/usePlayerCookie.ts`, 70 lines).
- `usePlayerLanding` (204 lines) seeds the claim from the cookie. It validates the claim once against the live roster and purges it if the GM removed that player.
- Accepted risk: anyone holding the link can answer for any roster name.
- **Port as is.** Rename the cookie (for example `ns_player`); the fresh deployment carries no old cookies.

## 4. Frontend: `apps/nextsession`

Stack today: Vite 8, React 19 with React Compiler, TanStack Router (file routes, `autoCodeSplitting`), TanStack Form plus zod, zustand, Convex 1.41, `@convex-dev/auth` 0.0.94. In the build, `base` is `/s/` because Lonir mounts the bundle under `/s` and `/groups` (`vite.config.ts:7-18`). **Redesign:** a standalone app serves from `/`.

### Routes (`src/routes`, 396 lines)

| Route | File | What it does | Verdict |
| --- | --- | --- | --- |
| `__root` | `__root.tsx` (64) | Toast provider, themed page fill, `ConsentGate`, `TestSignInBridge` | Port; drop `ConsentGate` (C3) |
| `/` | `index.tsx` (34) | Signed out: landing. Signed in: redirect to the last-visited group, else `/groups`. | Port |
| `/groups` | `groups.tsx` (26) | Layout route that wraps `GmGate` (auth → legal → early access) | Port; drop the early-access step |
| `/groups/` | `groups.index.tsx` (11) | `GroupListContainer` | Port |
| `/groups/$groupId` | `groups.$groupId.tsx` (52) | `GroupSurface`; search `?players=` (filter) and `?month=` (month name); remembers the last-visited group | Port |
| `groups.$groupId.prewarm.ts` | (33) | Lonir `@omnigame/data` prewarm of `getGroup` and `gmGetGroupSchedule` | Drop (optional: a TanStack loader) |
| `/s/$shareToken` | `s.$shareToken.tsx` (25) | `PlayerLandingContainer`; `?month=` | Port |
| `/terms`, `/privacy`, `/imprint` | (16, 29, 15) | `LegalDocumentPage`; `/privacy` also hosts `ConsentSettingsEntry` | Port the routes; new content (C4) |

`main.tsx` (142 lines):

- `initTelemetry` and `registerErrorSink` → `clientErrors`: **drop**.
- `consumeHandoffCodeFromUrl` and `HandoffGate`: **drop**.
- `ConvexAuthProvider` with the default `shouldHandleCode`: **port**.
- `DataRoot` from `@omnigame/data`: **drop**. It only feeds the prewarm dedupe.

### GM surface

- `components/GmGate.tsx` (111). The gate chain. It renders `LoginLandingContainer` while signed out, and splits the authenticated half out so the anon-rejecting `peekEntry` query never mounts for a signed-out visitor. **Port** the auth → legal order. **Drop** the early-access arm with `useEntryAccess.ts` (71), `PendingScreen*` (20 + 14) and `EntryErrorScreen.tsx` (33).
- `components/LoginLanding.tsx` (72) and `LoginLandingContainer.tsx` (68). Copy "Stop chasing the date"; Google button with an in-flight latch; `redirectTo` = same-origin deep link; no pre-auth checkbox; dev test-user button. **Redesign** the visuals (the map calls for a reworked UI). Port the behaviour.
- `components/GroupListContainer.tsx` (63) with `hooks/useGroups.ts` (51). "Your groups" list, paginated by 25 with "Load more"; empty state; sign-out; mounts the GM tutorial for the first group. **Port.**
- `features/schedule/GroupSurface.tsx` (85). Error boundary with "Try again"; rail on the left, dashboard on the right; stacked on mobile. **Port.**
- `features/schedule/ScheduleSidebarContainer.tsx` (132) with `hooks/useScheduleSidebar.ts` (121). Group rail cards (name, responded/total, next session); kebab with Rename (inline edit) and Delete (**no confirm on group delete**); "new group". **Port** (add a delete confirm, C7).
- `features/schedule/ScheduleGroupContainer.tsx` (117) with `hooks/useSchedule/index.tsx` (491), `useSchedule/playerFilter.ts` (111), `useScheduleMonth.ts` (107), `usePlayerFilter.ts` (65), `useGroup.ts` (53), `useGroupDetails.ts` (37) and `useScheduleGroup.ts` (69). The composed view model:
  - Month navigation from the current month to +2, URL-backed `?month=`.
  - Aggregate cells and Top Days.
  - Per-player badges and "availability at a glance".
  - Player Filter in `?players=`, re-aggregated client-side from `perPlayer`.
  - Selected-day panel with "Schedule session".
  - Upcoming and History session lists with unschedule.
  - Share link field with Copy and Rotate, plus a month-pinned share URL.
  - Optimistic schedule and unschedule with a revert toast; toasts on roster errors.
  - Fallback to the first group for a malformed or forbidden `:groupId`, without tripping the error boundary.
  
  **Port.** It is the core of GM parity.
- `components/AddPlayerForm.tsx` (34), `PlayerRowActions.tsx` (79) and `PlayerRowKebab.tsx` (86). Inline add, rename and two-step delete. **Port.**
- `components/SignOutContainer.tsx` (62) with `hooks/useSignOut.ts` (58). The confirm copy says "This signs you out of lonir too". **Redesign** the copy; port the flow.
- `components/GmTutorialContainer.tsx` (93) and `GmTutorialDialog.tsx` (80). "Your group is ready": two steps, the share URL shown, Copy (with a clipboard-failure state) and Later/Done. Dismissal is stored under `omnigame.gm.preferences.tutorialDismissed` (`stores/useGmPreferencesStore.ts`, 49, which also holds `lastVisitedGroupId`; `hooks/useLastVisitedGroup.ts`, 20). **Port**, renaming the storage keys.
- `components/GroupLink.tsx` (31), `urls.ts` (4), `hooks/useSystemThemeEffect.ts` (31, follows the OS dark/light setting). **Port.**
- `components/TestSignInBridge.tsx` (39). Installs `window.__omnigameTestSignIn(email)` for Playwright when test sign-in is enabled. **Port** (rename).

### Player surface

- `components/PlayerLandingContainer.tsx` (168) with `hooks/usePlayerLanding.ts` (204) and `usePlayerCookie.ts` (70). States:
  - Loading.
  - "Not found: this share link is no longer valid".
  - Picker: an alphabetical roster ("Pick your name") plus `SelfAddPlayerForm` (56, zod `trim().min(1)`, "Join").
  - Calendar, with the group name, "I'm someone else" and a `?` tutorial button.
  
  **Port.**
- `components/PlayerCalendarContainer.tsx` (50) with `hooks/usePlayerSchedule/index.ts` (216) and `useMonthNav.ts` (48):
  - Month view; past months are viewable and read-only; forward limit is the current month + 2.
  - `?month=` seeds the month, with fallback to the current month.
  - A tap cycles unanswered → yes → maybe → no → unanswered, optimistically, with a revert toast.
  - "Fill rest" writes `no`.
  
  **Port.**
- `components/PlayerTutorialContainer.tsx` (39) with `stores/usePlayerTutorialStore.ts` (28). The dialog opens on the first visit for each share token; acknowledgement is stored under `omnigame.player.tutorial`. `CyclingTipContainer.tsx` (19) rotates two tips every 3 taps. **Port.**

### Shared packages the app depends on

- `@omnigame/schedule` (`packages/schedule`): **port**. File by file (source / test lines):

  | File | Source | Test | Contents |
  | --- | --- | --- | --- |
  | `dates.ts` | 97 | 276 | `todayISO`, `currentMonthISO`, `addMonthsISO`, `daysInMonth`, `monthDateRange`, `isPast`, `isInWindow` (window = current + 2), `assertDateAllowed`, `isValidDateISO`, `isValidMonthISO`; UTC throughout (ADR-0047) |
  | `availability.ts` | 55 | 86 | `cycleAvailability`, `applyAvailabilityPatch` |
  | `gamification.ts` | 84 | 141 | `computeProgress`, `shouldFireParticles` |
  | `gmSchedule.ts` | 101 | 149 | optimistic schedule / unschedule patches |
  | `perPlayerAggregate.ts` | 130 | 70 | `aggregateForPlayers`, `scoreTopDay`, `playerInitials`, `formatHumanDate` |
  | `monthNames.ts` | 63 | 52 | `monthLongName`, `monthLabel`, `resolveMonthName` |
  | `locale.ts` | 125 | 51 | `weekStartForLocale` |
  | `badges.ts` | 16 | 57 | `sortBadgesByName` |
  | `types.ts` | 166 | 32 | shared types |
  | `buildPlayerShareUrl.ts` | 57 | 90 | in production, hard-codes `https://next-session.link`, else `VITE_PLAYER_ORIGIN` or `location.origin`; a separate `./share-url` entry |

  **Redesign `buildPlayerShareUrl`:** once the app is served on `next-session.link`, it is just `location.origin`.
- `@omnigame/ui`. The app imports `AuthHeroLayout`, `Button`, `CopyShareLinkField`, `CyclingTip`, `Dialog`, `EmptyState`, `ErrorBoundary`, `Form`, `GMSplitDashboard`, `GoogleSignInButton`, `IconButton`, `InlineEdit`, `Menu`, `PendingPage`, `PlayerCalendar`, `ScheduleGroupCard`, `ScheduleSidebar`, `ShellSkeleton`, `SubmitButton`, `TextField`, `Toast`, `TutorialDialog` and `useToast`. See §5.
- `@omnigame/compliance`: see §6.
- `@omnigame/telemetry`, `@omnigame/errors` (`createError` / `captureError` with why/fix), `@omnigame/env` (frontend manifest), `@omnigame/data` (`DataRoot`, prewarm). These are Lonir infrastructure. **Drop.** Replace them with a plain `env.ts` and plain error handling.

## 5. UI components: `packages/ui/src/components/schedule`

Source / test lines; 13 stories files.

| Component | Lines | Purpose | Verdict |
| --- | --- | --- | --- |
| `GMSplitDashboard.tsx` | 13 / 416 | The GM entry point; thin wrapper over `shared/ScheduleDashboard` | Port (behaviour), redesign (visuals) |
| `shared/ScheduleDashboard.tsx` | 265 | Calendar + Top Days + Players + date panel + Sessions + share slot layout | Port / redesign |
| `shared/ScheduleCalendar.tsx` | 367 / 71 | Month grid, month nav, month-share copy link, per-cell aggregate chips or per-player markers, session marker | Port / redesign |
| `shared/cellState.ts` | 82 | `deriveCellState`: perfect (all yes) / good / maybe / conflict (any no) / busy (all no) / neutral; cell classes | Port |
| `shared/TopDaysPanel.tsx` | 111 | Ranked best dates | Port |
| `shared/PlayersPanel.tsx` | 304 | Roster with responded state, selectable filter chips, row actions, kebab, add-player slot | Port |
| `shared/PlayerAvailabilityHover.tsx` | 181 | Hover/popover listing a player's Free / Maybe / Busy dates | Port |
| `shared/DatePlayersPanel.tsx` | 101 | Selected day: per-player state, "Schedule session" button | Port |
| `SessionsList.tsx` | 117 | Upcoming with unschedule; History collapsed | Port |
| `GMCalendar.tsx` | 17 / 206 | Alias over `ScheduleCalendar` | Port (fold in) |
| `ScheduleSidebar.tsx` | 102 / 127 | Group rail with "new group" and load more | Port |
| `ScheduleGroupCard.tsx` | 99 / 172 | Rail card: name, responded/total, next session | Port |
| `CopyShareLinkField.tsx` | 63 / 89 | Read-only URL field with copy | Port |
| `CopyLinkButton.tsx` | 49 / 73 | Copy button (month share) | Port |
| `PlayerCalendar.tsx` | 565 / 719 | Player month grid: tap cycle, locale week start, swipe between months, progress bar, legend, gold/grey particle bursts, Fill rest, read-only past | Port / redesign |
| `player/PlayerProgressBar.tsx`, `player/PlayerLegend.tsx` | 59, 46 | Progress and legend | Port |
| `TutorialDialog.tsx`, `TutorialPopover.tsx` | 67 / 121, 55 / 39 | Player tutorial | Port |
| `CyclingTip.tsx` | 29 / 40 | Rotating tip | Port |
| `SchedulePage.tsx`, `GMSchedulePanel.tsx` | 212, 315 | Old Lonir compositions; exported from `packages/ui/src/index.ts` but **no app imports them** | **Drop** |
| `schedule-component-boundaries.test.tsx` | 261 | Pins which components may import what | Drop (Lonir lint contract) |

The schedule components also pull Lonir primitives: `primitives/Calendar.tsx` (151), `Dialog`, `Menu`, `InlineEdit`, `Button`, `Form`, `TextField`, `Toast`, `ErrorBoundary`, `ShellSkeleton`, `EmptyState`, and `auth/AuthHeroLayout`, `GoogleSignInButton`, `PendingPage`. These get rebuilt in the new design system rather than copied wholesale. Lonir branding lives in tokens and fonts (`font-display`, `accent-*`), not in the schedule components.

## 6. Compliance: `packages/compliance`

- **Legal.** `LegalAcceptanceGate` (74) is the post-auth clickwrap with Accept and Sign out. `useLegalAcceptance` (38) reads `users.me.mustAcceptLegal`. `versions.ts` (28). `content.ts` (80) raw-imports `docs/legal/{terms-of-use,privacy-policy,imprint}.md` (144, 160, 35 lines, which mention Lonir/Omni 5, 3 and 1 times). `LegalDocumentPage` (37) sets the title to "— lonir". The `*Link` components and `LegalFooter` (41, includes an AI-output disclaimer). **Port the gate and the version mechanism. Redesign the documents** for Next Session; drop the AI disclaimer and Lonir branding. Writing the legal text is Michael's call as controller; see Surfaced.
- **Consent.** `ConsentGate` (81, banner), `consentStore` (155, localStorage key `omnigame.consent`), `useConsent` (49), `useAnalyticsConsentMirror` (84, server mirror) and `ConsentSettingsEntry` (33). The consent layer exists only to gate PostHog analytics. **Drop** (C3).

## 7. Tests that pin behaviour

### Backend (`packages/backend/convex`, convex-test)

Lines and test counts per file:

| File | Lines | Tests | Verdict |
| --- | --- | --- | --- |
| `groups.test.ts` | 542 | 24 | Port (minus workspace cases) |
| `groups.workspaceReaders.test.ts` | 116 | 3 | Drop |
| `scheduleGm.test.ts` | 1,308 | 48 | Port (roster, sessions incl. 409 / 422, schedule query) |
| `scheduleGm.perPlayer.test.ts` | 295 | 8 | Port |
| `scheduleGm.rail.test.ts` | 303 | 11 | Port |
| `scheduleGm.activation.telemetry.test.ts` | 620 | 26 | Drop |
| `scheduleGm/activation.test.ts` | 131 | 9 | Drop |
| `scheduleShare.test.ts` | 524 | 21 | Port (player surface: share-token auth, window, fill rest, self-add, claim) |
| `availability.test.ts` | 429 | 15 | Port |
| `auth/groupAccess.test.ts` | 411 | 23 | Port the owner and anonymous cases; drop the workspace path |
| `auth/redirect.test.ts` | 109 | 12 | Port, reduced |
| `auth/handoff.test.ts` | 93 | 9 | Drop |
| `auth.test.ts` | 428 | 17 | Partly port (sign-in seeds the first group) |
| `earlyAccess.test.ts` | 263 | 14 | Drop |
| `consent.test.ts` | 154 | 9 | Drop |
| `users.legal-acceptance.test.ts` | 116 | 7 | Port |
| `admin.scheduling.test.ts` | 171 | 4 | Drop |

### `packages/schedule`

1,004 test lines across the 10 files in §4. **Port all of them.**

### `apps/nextsession`

4,942 test lines. These run against a real convex-test backend through `@omnigame/backend/testing-setup`.

| File | Lines | Tests | Verdict |
| --- | --- | --- | --- |
| `useSchedule.test.tsx` | 737 | 26 | Port. Covers route group resolution, deep links beyond page 1, fallback for malformed or forbidden ids, schedule round trip, revert toast, month window moving the query, `?players=` restore. |
| `usePlayerSchedule.test.ts` | 428 | 17 | Port |
| `schedulePolish.contract.test.tsx` | 403 | 13 | Port (Player Filter, markers, at-a-glance hover, kebab) |
| `usePlayerLanding.test.ts` | 232 | 12 | Port |
| `ScheduleSidebarContainer.*.test.tsx` | 213 + 144 + 136 | 9 | Port |
| `useScheduleMonth.test.tsx` | 196 | 10 | Port |
| `useHandoffRedemption.test.ts` | 193 | 9 | Drop |
| `usePlayerCookie.test.ts` | 167 | 10 | Port |
| `GmTutorialContainer.test.tsx` | 161 | 14 | Port |
| `PlayerTutorialContainer.test.tsx` | 151 | 8 | Port |
| `ScheduleGroupContainer.test.tsx` | 143 | 2 | Port |
| `useGroupDetails.test.ts` | 139 | 5 | Port |
| `GroupSurface.test.tsx` | 116 | 4 | Port |
| `PlayerRowActions.test.tsx` | 104 | 6 | Port |
| `useSystemThemeEffect.test.ts` | 98 | 5 | Port |
| `__root.test.tsx` | 91 | 4 | Port, minus consent |
| `GmTutorialDialog.test.tsx` | 80 | 8 | Port |
| `LoginLanding.test.tsx` / `LoginLandingContainer.test.tsx` | 75 / 60 | 7 / 2 | Port |
| `AddPlayerForm.test.tsx` | 70 | 5 | Port |
| `PlayerRowKebab.test.tsx` | 63 | 3 | Port |
| `useScheduleGroup.test.ts` | 63 | 7 | Port |
| `SelfAddPlayerForm.test.tsx` | 62 | 4 | Port |
| `useGmPreferencesStore.test.ts` | 54 | 7 | Port |
| `PlayerLandingContainer.test.tsx` | 37 | 2 | Port |
| `router.test.ts` / `urls.test.ts` | 33 / 20 | 2 / 2 | Port |
| `chunkGraph.test.ts` | 473 | 9 | Port the idea: run the real vite build and assert the `/s/$shareToken` chunk graph holds no GM container |

### UI

About 2,330 test lines in `packages/ui/src/components/schedule/*.test.tsx`, plus `primitives/Calendar.test.tsx`. Port them with the components, rewritten where the design changes.

### Compliance

`consent.test.tsx` (405), `useAnalyticsConsentMirror.test.tsx` (323), `consentStore.storage-boundary.test.ts` (85): drop. `legal-documents.test.tsx` (287), `useLegalAcceptance.test.ts` (186), `LegalAcceptanceGate.test.tsx` (60): port.

### e2e (`apps/web-e2e/tests`, Playwright against the nextsession dev server on port 5174)

These are the parity evidence. **Port them all except navigation.**

- `standalone-schedule.spec.ts` (507): rail create and deep link; rename and delete; roster add, rename and remove; month grid; schedule and unschedule from the selected day; Upcoming and collapsed History; copy share link and rotate (old token dies); `?players=` survives a reload.
- `standalone-signup.spec.ts` (155): a new user reaches an owned group; the first run hands over the share link; signed-out deep links to `/groups` and to a group show the landing; legal pages resolve; sign-out ends the session.
- `standalone-player-continuity.spec.ts` (155): a signed-in GM still sees the player surface at `/s/:token`; cookie identity; an undecided-consent visitor is not blocked; `?month=` deep link; a signed-out visitor with a player cookie sees the plain landing.
- `standalone-navigation.spec.ts` (25): the Lonir link-out. Drop.
- `lib/schedule.ts` (87) and `lib/schedule.test.ts` (210): helpers. Port.

## 8. Feature list for parity

### GM

1. Sign in with Google from a landing that states the product. Deep links survive sign-in through the same-origin `redirectTo`.
2. Accept Terms and Privacy once after first sign-in (clickwrap with stored versions). Sign out from the gate.
3. A first group, "My Group" with a share token, exists right after sign-up.
4. First-run tutorial: shows the player link, copies it (with a clipboard-failure fallback), dismissible, shown once per browser.
5. "Your groups" list: paginated, load more, empty state. `/` sends a returning GM to the last-visited group.
6. Group rail: every group shows its responded/total count and next session date. Create, rename inline, delete.
7. Group surface: month calendar from the current month to +2, with prev/next and a deep-linkable `?month=`. Cells are colored by aggregate state (perfect, good, maybe, conflict, busy) with count chips.
8. Top Days ranking.
9. Players panel: responded badge, add a player inline, rename inline, two-step remove (removes their answers), "availability at a glance" hover.
10. Player Filter: select a subset to re-aggregate cells with per-player initials markers. "Clear filter (n)". Deep-linkable `?players=`; ids not on the roster are ignored.
11. Select a day to see per-player answers (including unanswered) and schedule a session. One session per date; past and out-of-window dates are rejected. Optimistic, with a revert toast.
12. Sessions: Upcoming with unschedule; History collapsed.
13. Share link: copy the player link, copy a month-pinned player link, rotate the token (old links die).
14. Errors: a malformed or forbidden group id falls back to the first group; an error boundary offers "Try again"; roster-write failures show a toast.
15. Sign out with confirmation.
16. Theme follows the OS light/dark setting.

### Player

1. Open `/s/:token` without an account. An unknown token shows "This share link is no longer valid".
2. Pick a name from the alphabetical roster, or add a new name ("Join", blank names rejected).
3. Returning visit: the cookie skips the picker. A removed player falls back to the picker. "I'm someone else" re-opens the picker.
4. Calendar: the month from `?month=`, else the current month. Forward limit is the current month + 2; past months are read-only; locale-aware week start; swipe or arrows between months.
5. A tap cycles Free → Maybe → Busy → unanswered and saves instantly (optimistic, revert toast). "Fill rest" marks every remaining future day Busy.
6. Progress bar, legend, particle feedback, cycling tips.
7. A first-visit tutorial for each share token, re-openable from `?`.

## 9. Port / redesign / drop summary

- **Port.** `packages/schedule`. The `availability`, `memberships`, `sessions` and `groups` tables (trimmed). The group CRUD, roster, session, GM-query and player functions in §3.1. Share token minting. Cookie player identity. The GM and player containers and hooks. The schedule UI behaviour. Both tutorials. The legal clickwrap mechanism. Test sign-in for e2e. The tests and e2e specs marked port.
- **Redesign.**
  - The group wrapper becomes owner-only, with `ownerUserId` required.
  - Sign-up seeds the first group directly, with no workspace.
  - The auth redirect allowlist shrinks to one origin.
  - `users.me` returns a minimal DTO.
  - `getByShareToken` and `getGroup` return DTOs without `workspaceId`.
  - Server-side name validation is added to `selfAddPlayer`, `addPlayer`, `renamePlayer` and `renameGroup`.
  - `sessions.status` is dropped or simplified.
  - `buildPlayerShareUrl` becomes `location.origin`.
  - Vite `base` becomes `/`.
  - Landing, sign-out copy and legal documents are rewritten for Next Session.
  - All UI visuals move to the new design.
  - Storage and cookie keys are renamed off `omnigame.*`.
- **Drop.**
  - Workspaces and `groups.workspaceId`.
  - `sessions.sessionEntityId` and the debrief index.
  - `memberships.userId` and `memberships.role`.
  - Early-access gate, Pending screen, waitlist leads and `users.isAdmin`.
  - Hand-off (table, provider, mint and redeem, `HandoffGate`).
  - `session_scheduled` PostHog activation, the consent banner and consent mirror, `initTelemetry`, `clientErrors`.
  - `@omnigame/{telemetry,errors,data,env}`, the prewarm.
  - `gmGetNextSession`, `gmGetGroupRailData`, `listGroups`, `createGroup`, `listSessions`, `getAvailability`, the duplicate `scheduleShare` facade.
  - `SchedulePage` and `GMSchedulePanel`.
  - Lonir admin scheduling metrics.
  - Lonir-specific tests: workspace readers, activation, hand-off, early access, consent, component-boundary lint.

## 10. Calls made (each reversible)

- **C1. Owner-only group authority.** Lonir's "owner OR linked-workspace member" rule exists only for workspaces. *Alternative:* add group co-GMs later through an explicit `groupMembers` table.
- **C2. Drop the early-access gate.** It is Lonir's launch funnel and depends on PostHog flags and an admin unlock UI that the port does not have. *Alternative:* a server-side email allowlist env var checked in `afterUserCreatedOrUpdated`, if Michael wants a soft launch.
- **C3. Drop analytics, and with it the consent banner and consent mirror.** The scope rule drops Lonir telemetry. Without non-essential storage, a § 25 TDDDG banner is not needed: auth tokens, the player cookie and UI preferences are strictly necessary or user-requested. *Alternative:* add privacy-friendly analytics later and bring back a banner at the same time.
- **C4. Keep post-auth clickwrap acceptance, with new Next-Session-specific documents and versions.** *Alternative:* plain links in the footer with no acceptance gate. That is weaker evidence, but simpler.
- **C5. Drop `sessions.status`.** Scheduling only ever writes `scheduled`, unscheduling deletes, and History is derived from the date. *Alternative:* keep `status: 'scheduled' | 'cancelled'` if a "cancelled" history entry is wanted.
- **C6. Drop the hand-off.** ADR-0178 already made it dead code. No alternative is needed on one origin.
- **C7. Add a confirm step to group delete.** Lonir deletes a whole group with one menu click, while player delete is two-step. *Alternative:* keep exact parity.
- **C8. Validate names on the server** (trim, non-empty, max length) for group and player names. Lonir trusts the client. *Alternative:* exact parity.

## Surfaced

- The legal documents (Terms, Privacy, Imprint) must be authored for Next Session with Michael as controller. The Lonir texts name Lonir and AI features. Who writes them, and does Michael's existing imprint carry over? This affects the legal-pages slice and may need Michael's input.
- The player share-link origin: Lonir hard-codes `https://next-session.link` for production share links (`packages/schedule/src/buildPlayerShareUrl.ts:32`). Existing links point at Lonir's deployment and will not resolve on the new one, since data migration is out of scope. The cutover ticket should decide whether `next-session.link/s/<old>` shows a friendly "this link moved" page.
- Booking window: GM and player both stop at the current month + 2 (`dates.ts:64`, `MAX_MONTHS_FORWARD = 2` in two hooks). Keep it, or make it configurable? Parity says keep.
- Rate limiting on public player mutations (`selfAddPlayer` especially) does not exist in Lonir. A public sign-up product may want `@convex-dev/rate-limiter` on roster growth per share token.

## Sources

All of these are primary sources in `Omni-GM/lonir@824bd52`:

- `docs/specs/next-session-link-standalone.md` (778 lines)
- ADRs 0077, 0152, 0160, 0172, 0173, 0178 in `docs/adr/`
- `CONTEXT.md`
- `packages/backend/convex/{schemaCore.ts, groups.ts, groups/*, scheduleGm/*, unauthenticated/playerSchedule.ts, auth/{groupAccess,provider,redirect,handoff}.ts, earlyAccess*, users.ts, consent.ts, lib/shortId.ts}`
- `apps/nextsession/src/**`
- `packages/schedule/src/**`
- `packages/ui/src/components/schedule/**`
- `packages/compliance/src/**`
- `apps/web-e2e/tests/standalone-*.spec.ts`
