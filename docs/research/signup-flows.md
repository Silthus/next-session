# Sign-up flows: what made the old ones smooth

Research for [#3](https://github.com/Silthus/next-session/issues/3) on the map [#1](https://github.com/Silthus/next-session/issues/1). Researched 2026-10-02.

## Answer

The smooth flow Michael remembers is the **anonymous-first "Create Your Link"** flow in the OmniGM scheduling app. It lived in `apps/scheduling` of `Silthus/OmniGM` until commit `be2da993` (2026-03-13) removed it. A GM clicked one button, typed nothing, and the share link typed itself out on the landing page with Copy and WhatsApp, Telegram, and Mail buttons underneath. The GM got a real account later, prompted by a nudge that appeared once players had joined.

Next Session should rebuild that flow on Convex Auth:

1. **GM:** landing page, then **Create your link**: one click, no fields, no third-party credentials. A Convex Auth `Anonymous` user is created. The group and its share token are created in the same act. The terms are accepted by that same click and recorded on that user.
2. **Link in hand:** the link shows inline with **Copy** and share buttons. Then **Open your group**.
3. **Keep it:** after the first player joins, a soft nudge asks the GM to save the group with Google or an email code. The group moves to the real account, and the share link does not change.
4. **Player:** opens the share link, taps or types their name, and taps days. No account, no terms gate, a per-link cookie.

Cut: Lonir's Google-only wall, the separate post-auth legal gate as a first-run step, the early-access Pending screen, workspace minting, the cross-origin hand-off, and passwords.

## Sources

| Source | Where | Commit |
|---|---|---|
| OmniGM scheduling app (the centerpiece) | `Silthus/OmniGM`, `apps/scheduling`, `packages/domain-scheduling` | `155bc1f3`, the last commit before removal in `be2da993` |
| OmniGM main app (archived HEAD) | `Silthus/OmniGM`, `apps/omnigm` | HEAD of the archived repo |
| omni-gm-old | `Omni-GM/omni-gm-old-01052026`, `apps/web`, `convex` | HEAD. Its full history (1575 commits) has no scheduling app |
| Lonir's current Next Session | `Omni-GM/lonir`, `apps/nextsession`, `packages/backend/convex`, `packages/compliance` | shallow HEAD |
| Convex Auth docs | [labs.convex.dev/auth](https://labs.convex.dev/auth/config) | read 2026-10-02 |

In the first three sources, file paths are relative to the app or repo root of that source.

## Flow 1: OmniGM scheduling, "Create Your Link"

This is the centerpiece. Paths are relative to `apps/scheduling/src/` unless they say otherwise.

### Intent

- ADR-0009 (`docs/adrs/ADR-0009-anonymous-auth-for-gm-onboarding.md:13`): "v0.2 requires frictionless GM onboarding: a GM clicks "Create Your Link" and gets a scheduling space without creating an account."
- The PRD (`_bmad-output/scheduling/planning-artifacts/prd.md:54`): "remove every barrier between "I want to schedule a session" and "my players have marked their availability." Zero-config start, no account required for players, auto-save on every tap."
- The PRD (`prd.md:102`): "No sign-up, no group creation, no settings, no onboarding wizard."
- The PRD (`prd.md:1029`): "v0.01/v0.1 require account creation first. v0.2 removes this friction — GMs create a link instantly via BA anonymous plugin, account comes later."
- The UX spec (`ux-design-specification.md:619-628`) changed the CTA from "Get Started, It's Free → /scheduling/signup" to "Create Your Link → instantly creates space".
- ADR-0009 picked a real anonymous auth user over cookie columns on the domain table: "Zero branching. Zero "cookie GM" concept." Every server action reads one session, whether the GM is anonymous or not.

### GM, step by step

1. **Entry.** The landing page at `/` (`app/page.tsx`) has the H1 "Session Scheduling for Game Masters" (`:230`). Under it sit the CTA and a three-step carousel: "Create Your Link", "Share With Players", "See Who Can Play" (`app/components/onboarding-carousel.tsx:101-110`). The closing line is "Get your scheduling link in 30 seconds." (`page.tsx:295-298`). There is a small "or sign up first" link for people who want an account up front (`:303-310`).
2. **Create Your Link: one click, no fields.** The click calls `authClient.signIn.anonymous()` (`app/components/landing-cta.tsx:88`). Better Auth creates an `isAnonymous` user (`lib/auth.ts:57-58`). The `user.create.after` hook creates a space named "Session Scheduling" with a 5-character slug (`lib/auth.ts:96-113`, `packages/domain-scheduling/src/service/scheduling-service.ts:770-805`). The GM can rename it later inline on the dashboard (`dashboard-shell.tsx:313`).
3. **The link appears in place.** The button morphs, a progress bar runs, and `${origin}/s/${slug}` types itself out at 40 ms per character (`app/components/morphing-button.tsx:194-253`). **Copy Link** follows, plus WhatsApp, Telegram, Mail, and native Share buttons with a prefilled message: "Hey, I am planning our next session! … It only takes 30s…" (`share-deep-links.tsx:6-11, 210-284`).
4. **Sharing comes before the dashboard.** **View Schedule** appears only after the GM copies or shares the link (`landing-cta.tsx:55, 151-154`). The flow makes the share the first job.
5. **Dashboard** at `/scheduling/dashboard`. The GM's only credential is the Better Auth session cookie (`proxy.ts:66-81`). A GM who returns to `/` in the same browser sees the finished link again (`page.tsx:180-190`).

**Time to first value: 1 click and 0 fields to hold a link, 2 clicks to have it in the group chat.** e2e `E2E-v2-01` in `e2e/anonymous-onboarding.spec.ts:8-32` pins this flow. The PRD target is under 30 seconds (`prd.md:94`).

### Anonymous to real account

- **Auth methods:** email and password with a minimum of 8 characters, Discord OAuth, and Google OAuth. Each OAuth provider is enabled only when its env vars are set (`lib/auth.ts:35-56`). There was no magic link and no password reset (`prd.md:800`).
- **Prompts.** None of them blocks the GM:
  - A permanent **Create Account** button in the dashboard header while the GM is anonymous (`dashboard-shell.tsx:316-319`).
  - `AccountNudgeBanner`, shown once at least one player has joined: "Your players are joining! Create an account to keep your scheduling link permanently. Without an account, this space expires in {N} days." (`account-nudge-banner.tsx:39-40`).
  - Confirming a session date requires an account (`dashboard/actions.ts:112-115`).
- **Merge.** Better Auth's `onLinkAccount` moves space ownership, participant links, and confirmations to the new user in one transaction. The share slug stays the same (`scheduling-service.ts:807-852`). e2e `E2E-v2-07` and `E2E-v2-08` pin this.

### Player, step by step

1. Open `/s/<slug>`. An unknown slug shows "This scheduling link doesn't exist / Check with your GM for the latest link" (`app/scheduling/[slug]/not-found.tsx:7-12`).
2. **NameEntry** asks "What Should We Call You?", one field, then **Let's Go** (`name-entry.tsx:96-149`). If players already exist, **ParticipantPicker** asks "Which player are you?", with "None of these? Enter a new name" as an escape (`participant-picker.tsx:99-147`).
3. Identity is an httpOnly cookie, `omnigm_participant`, that lasts 1 year (`lib/participant-cookie.ts:3-23`).
4. A three-step "How it works" modal appears, dismissed with **Got it!** (`player-tutorial-overlay.tsx:8-27`).
5. Each tap on a date cycles none, OK, IF, and back to none. It saves optimistically, with no submit button (`hooks/use-availability-editor.ts:61-89`).

**Time to first value: 1 field and 3 clicks.** A returning player in the same browser skips the name step (`scheduling-flow.spec.ts:147-189`).

### Legal

There was no terms or privacy acceptance anywhere, only a non-blocking analytics cookie bar (`components/cookie-consent-banner.tsx:47-57`). Next Session cannot copy this part: Lonir's compliance work (ADR-0160) exists for a reason.

### What went wrong

All of this was checked against the code.

- **The GM's only key was one browser's session cookie.** There was no admin link and no email recovery. A new device or a cleared cookie lost the group (`prd.md:424`).
- **Silent deletion after 7 days.** The ADR and the PRD say 14 days. The code says `ANONYMOUS_TTL_DAYS = 7` (`packages/domain-scheduling/src/constants.ts:1`). The "space expired" message from the PRD was never built (`prd.md:425`).
- **Merging deleted the real account's spaces.** `handleAccountLink` deletes every space the real account already owns before it moves the anonymous one (`scheduling-service.ts:828-831`). A GM who clicked Create while logged out and then logged in lost their existing group.
- **The upgrade form prefilled "Anonymous" as the display name** (`signup-form.tsx:179`).
- **One player cookie for all spaces.** Joining a second GM's space overwrote the identity for the first (`participant-cookie.ts:3`).
- **The player tutorial was a blocking modal,** an extra click for every new browser.
- **`apps/scheduling/.env.scheduling` was committed** in `be62469e` with non-empty secret values. The repo is private and archived. The values are not reproduced here.

## Flow 2: OmniGM main app (archived HEAD)

Paths are relative to `apps/omnigm/src/`.

1. **Entry.** The marketing landing's CTAs ("Import Your Campaign" and "Get Started — It's Free") both go to `/world/import` (`app/page.tsx:217, 262`). That page redirects signed-out visitors to `/world/auth?redirectTo=/world/import` (`app/world/import/page.tsx:34-37`).
2. **Auth form,** in sign-up mode by default (`app/world/auth/world-auth-form.tsx:19`). It asks for Display Name (2-30 characters), Email, and Password (at least 8). Discord and Google buttons appear only when their env vars are set (`:88-178`, `lib/auth.ts:29-49`). There is no email verification and no password reset.
3. **Legal:** none. The footer reads only "© {year} OmniGM" (`app/page.tsx:270-272`).
4. **First run:** the "No imports yet" empty state, then a vault upload and an LLM import pipeline. Nothing is created at sign-up (`app/world/import/import-dashboard.tsx:96-111`).
5. **Players:** no invite or share mechanism.
6. **Time to first value:** about 5 clicks plus three typed fields, then a long pipeline wait.

What to learn from it: `redirectTo` returns the user to where they started, and OAuth buttons gated on config let a deployment run without OAuth keys. Its docs and e2e specs still describe the anonymous flow from Flow 1, which the code no longer has.

## Flow 3: omni-gm-old

Paths are relative to the repo root.

1. **Entry.** Every route redirects to `/signin` (`apps/web/src/routes/_auth.tsx:15-17`). The page shows a logo, "Your gamemaster's library", and one **Sign in with Google** button (`apps/web/src/routes/signin.tsx:60-128`).
2. **Auth:** Convex Auth with `providers: [Google]` in production (`convex/auth.ts:24`). It needs `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. A `test-password` provider exists outside production only (`convex/auth.ts:6-21`). No fields.
3. **Legal:** none.
4. **First run:** a "Default" workspace is created idempotently (`convex/identity/mutations.ts:7-62`). Home offers "Prepare your first session →", which opens a conversational `/get-started` ritual.
5. **Players:** email-based workspace membership. "Invite sent!" sends no email (`apps/web/src/features/settings/components/members-section.tsx:101`). Pending invites link on first Google sign-in when the email matches (`convex/auth.ts:26-48`).
6. **Time to first value:** about 2 clicks to an empty workspace. Sharing takes about 6 more actions, and the invitee has to be told out of band.

What to learn from it: Convex Auth Google sign-in is one click when the visitor is already signed in to Google, and idempotent "ensure default" provisioning after auth is robust. Its full git history holds no scheduling app or older sign-up flow.

## Flow 4: Lonir's current Next Session

Paths are relative to `Omni-GM/lonir`.

### GM, step by step

1. **Entry.** In production the app is mounted at `/groups` on the Convex site origin, and Lonir owns `/` (`packages/backend/convex/staticHostingApps.ts:46-66`, ADR-0178). A signed-out deep link renders `LoginLanding` (`apps/nextsession/src/components/GmGate.tsx:47-53`):
   - "Stop chasing the date."
   - "Make a group, send one link, and watch the free nights fall out. Your players never sign up for anything." (`LoginLanding.tsx:44-50`)
   - One Google button.
   - The notice "By continuing you will be asked to accept our Terms of Use and Privacy Policy." (`:62-67`)
2. **Analytics consent banner.** It appears first for every visitor, players included. It is per origin and re-asks by design (`apps/nextsession/src/routes/__root.tsx:43-61`).
3. **Google OAuth:** a full-page redirect, then 1-2 clicks on Google's side. The button latches so a double tap cannot overwrite the PKCE verifier (`LoginLandingContainer.tsx:35-41`).
4. **Legal gate:** a full-screen "Please accept our updated terms" with **Accept Terms & Privacy Policy** or **Log out** (`packages/compliance/src/legal/LegalAcceptanceGate.tsx:36-73`).
   - Accepting stamps `acceptedTermsVersion`, `acceptedPrivacyVersion`, and `acceptedLegalAt` on the user (`packages/backend/convex/users.ts:45-54`).
   - Re-acceptance is triggered only below `minAccepted` (`packages/backend/convex/legal/versions.ts:25-53`).
   - The gate chain is auth, then legal, then early access, then the app (`GmGate.tsx:14-26`).
5. **Early access.** In production a PostHog flag can route the user to a Lonir-branded Pending screen, "You're on the list.", whose only action is Sign out (`packages/backend/convex/earlyAccess/resolveEarlyAccess.ts:79-98`, `packages/ui/src/components/auth/PendingPage.tsx:29-50`). An admin unlock flips the user into the app live.
6. **Provisioning.** The sign-in callback creates a workspace, "My Group", and a share token (`packages/backend/convex/auth/provider.ts:42-55`, `groups/seedDefaultGroup.ts:32-39`).
7. **GM tutorial.** "Your group is ready / Two steps and you never chase a date again." It shows the link, **Copy player link**, and **Later** (`apps/nextsession/src/components/GmTutorialDialog.tsx:44-76`). It appears only on the `/groups` list, and its dismissal is stored per browser.

**Time to first value: about 4-6 clicks** (consent, Google, the Google chooser, Accept, Copy). With the early-access flag on, the user may stop at Pending. e2e `apps/web-e2e/tests/standalone-signup.spec.ts:22-71` pins this path.

### Player

`/s/$shareToken` (`apps/nextsession/src/components/PlayerLandingContainer.tsx:58-122`):

1. Tap a name the GM added, or type "Your name" and press **Join** (`SelfAddPlayerForm.tsx:43-54`).
2. A non-modal "How it works" dialog appears, stored per token (`PlayerTutorialContainer.tsx:17-35`).
3. Tap days. Saves are instant and optimistic, and a failure reverts with a toast.

Identity is the cookie `omnigm_player`, scoped to `Path=/s`, valid for 1 year, holding a **map of share token to claim** (`usePlayerCookie.ts:398-420`). ADR-0077 made the player surface fully unauthenticated: "the share token is the only credential." There is no legal gate for players, and **I'm someone else** resets the identity. **About 2-3 clicks to the first mark.**

### Weak spots

- **Google is the only sign-in,** so a player who wants to become a GM needs Google.
- **The Pending screen is Lonir-branded** and offers no waitlist form. A user whose waitlist email differs from their Google email stays stuck.
- **Pending comes after Accept,** so a user accepts the terms and only then learns they are waitlisted.
- **Two link hosts.** The tutorial copies `window.location.origin/s/…`, while the group surface prints `https://next-session.link/s/…` (`GmTutorialContainer.tsx:34`, `packages/schedule/src/buildPlayerShareUrl.ts:30-45`).
- **The hand-off machinery is dead weight.** ADR-0178 stopped minting hand-off codes, but `Handoff` still ships (`auth/provider.ts:24`).

## Side by side

| | OmniGM scheduling | OmniGM main | omni-gm-old | Lonir Next Session |
|---|---|---|---|---|
| GM entry | Landing CTA | Landing CTA, then auth wall | Auth wall | Auth wall at `/groups` |
| GM auth | Anonymous first, then email+password, Google, or Discord | Email+password, Google, Discord | Google | Google |
| GM fields | 0 | 3 | 0 | 0 |
| Legal | None | None | None | Post-auth clickwrap gate |
| Provisioning | Space on anonymous sign-in | On first import | Default workspace | Workspace, group, and token on sign-in |
| Clicks to share link | **1** | n/a | n/a | 4-6 |
| Player | Name + cookie, no account | n/a | Email invite + Google | Name + per-token cookie, no account |
| Clicks to first mark | 3 + 1 field | n/a | n/a | 2-3 |

## Recommendation for Next Session

### The GM flow

1. **Landing `/`.** Lonir's copy works: "Stop chasing the date." Use one primary button, **Create your link**, and a quiet **Log in** in the header. Under the button: "By creating a link you agree to the [Terms] and [Privacy Policy]." Add the carousel's three steps as plain text: create, share, pick.
2. **Click Create your link.** The client calls `signIn('anonymous')`. One mutation then:
   - creates the group with a default name ("My group"),
   - creates the share token,
   - stamps `acceptedTermsVersion`, `acceptedPrivacyVersion`, and `acceptedLegalAt` on the new user.
3. **The link appears in place,** with **Copy** and share buttons (native share, WhatsApp, Telegram, Mail) and a prefilled message. The animation is optional; showing the link where the button was is the important part. This replaces Lonir's separate GM tutorial dialog: its terminal step *is* the landing.
4. **Open your group.** This leads to the GM surface with the link field always visible and the name editable inline.

**That is 1 click to hold a share link, 2 to have it in the group chat, with 0 fields and no third-party credential.**

5. **Keep your group.** Show a permanent **Save your group** button. After the first player joins, add a dismissible banner: "Your players are joining. Sign in to keep this group on every device." Signing in moves the group to the real account.
6. **Returning GM:** **Log in** in the header goes to the same providers. An anonymous GM in the same browser simply lands back on their group.

### Auth methods

| Method | Role | Third-party credentials | Decision |
|---|---|---|---|
| Convex Auth `Anonymous` | Create-your-link | None | **Keep. Required.** |
| Google OAuth | Save or log in | `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`, from an OAuth client in a Google Cloud project. The redirect URI is `<deployment>.convex.site/api/auth/callback/google`. Google's consent screen shows the `.convex.site` domain unless the Convex plan supports a custom domain ([docs](https://labs.convex.dev/auth/config/oauth/google)) | **Keep.** Lonir proves it works. **Depends on the hosting/auth ticket** |
| Email code (OTP) via Resend | Save or log in for people without Google | `AUTH_RESEND_KEY`, a Resend account, and a verified sending domain, which needs DNS on `next-session.link` ([docs](https://labs.convex.dev/auth/config/otps)) | **Keep if feasible.** **Depends on the hosting/auth ticket.** Ship Google first if this is blocked |
| Password | | None, but no reset without email | **Cut.** OmniGM shipped it without reset, and a password without recovery is a trap |
| Discord OAuth | | Discord application client ID and secret | **Cut for v1.** Add later behind a config gate the way OmniGM did |
| `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` | Convex Auth plumbing | Generated, no third party | Required |

### Merging an anonymous user into a real account

Convex Auth does **not** link an anonymous user to the account it later signs in with. Linking is keyed on a verified email or phone number. "Using any authentication method while the user is logged-in will invalidate their existing session and create a new one." ([Advanced](https://labs.convex.dev/auth/advanced)) The merge has to be built:

- Before the save redirect, the anonymous session mints a single-use claim code. Store it hashed with a short TTL, the same shape as Lonir's `authHandoffCodes` (`packages/backend/convex/auth/handoff.ts:62-65, 143-209`). Keep the code in `sessionStorage`.
- After sign-in, the client redeems the code. The server moves the anonymous user's groups to the real user, then deletes the anonymous user.
- **Merge, never replace.** The real account keeps its existing groups. This avoids OmniGM's `handleAccountLink` bug.
- The spec should check whether a `createOrUpdateUser` callback can read the anonymous session during `signIn`, which would remove the claim code. Treat that as an optimization, not the plan.

### Where legal acceptance sits

**The Create your link button is the acceptance act.** The notice sits next to the button, and the same mutation that creates the anonymous user stamps both document versions and a timestamp on it.

This keeps Lonir's ADR-0160 rule, "attributable to a real `Id<'users'>`, stamped with both document versions and a timestamp", because the anonymous user row exists in the same act. It also costs zero extra clicks. Keep `LegalAcceptanceGate` only for **re-acceptance** when a `minAccepted` version is raised.

- **Alternative:** Lonir's separate post-auth Accept screen. It costs one extra click on the critical path. Switch to it if counsel finds that the notice next to the button is not enough.
- **Not legal advice.** The privacy policy is information under GDPR Art. 13 rather than something to accept, so the terms are what actually need the act.

**Players see no legal gate,** as in every prior flow. The player page footer links Terms, Privacy, and Imprint. The player cookie is strictly necessary, so it needs no consent. **Ship no analytics in v1, and therefore no consent banner.** If analytics comes later, use a non-blocking bar like OmniGM's and stay cookieless until the user consents.

### What a player sees through a share link

1. `/s/<token>` shows the group name and "Who are you?", with buttons for names the GM added and one field plus **Join** for a new name.
2. The calendar, with a **non-modal** hint ("Tap a day: free, maybe, busy. Saves instantly.") that can be reopened with **?**.
3. Taps save instantly.
4. A returning player skips step 1 through the per-token cookie map, and **I'm someone else** resets it.
5. A quiet footer link, **Plan your own game → Create your link**, turns a player into a GM. That is Lonir's F2 conversion path, now with zero friction.

**1 field and 2 clicks to the first mark.**

### Keep

- OmniGM: anonymous-first creation with no fields, the link shown in place on the landing, share-before-dashboard, prefilled share buttons, the nudge triggered by the first player joining, and the share link staying the same through the upgrade.
- Lonir: the landing copy, the double-tap latch on OAuth, the deep links that fall back to the landing, the stamped legal versions with `minAccepted` re-acceptance, the per-token player cookie map, the non-modal player hint, optimistic saves, **I'm someone else**, the fail-closed gates behind skeletons, and the redirect allowlist.
- omni-gm-old: idempotent provisioning that can be retried.

### Cut

- **Lonir's auth wall and Google-only sign-in on the way in.** Google moves to "save" and "log in".
- **The legal gate as a first-run step,** replaced by the click on Create (the gate stays for re-acceptance only).
- **The early-access Pending screen and waitlist (ADR-0152).** The destination is a smooth public sign-up. If abuse appears, add rate limits rather than a waitlist.
- **Workspace minting, the hand-off provider and codes, and the "signs you out of lonir too" copy,** all Lonir coupling under the map's scope rule. The claim-code shape is reused for the merge, but `Handoff` itself does not carry over.
- **The analytics consent banner,** while v1 ships no analytics.
- **Passwords and Discord.**
- **OmniGM's mistakes:** the blocking tutorial modal, one cookie for every space, the merge that deletes the real account's groups, and silent expiry.

### Calls made, each with its alternative

| Call | Alternative |
|---|---|
| Anonymous-first creation | An auth wall first (Lonir), which costs 3-5 clicks before the link |
| Acceptance on the Create click | A separate Accept screen (Lonir), one extra click |
| Google plus an email code for saving | Google only, if Resend or DNS is not feasible at launch |
| No early-access gate | Keep ADR-0152's gate behind a flag |
| An anonymous group is deleted after **30 days with no activity**, and the GM surface shows the date | OmniGM's 7 days, or never |
| No analytics in v1 | PostHog with a cookieless-until-consent bar |

## Surfaced

- **Hosting/auth dependency.** Google OAuth needs a Google Cloud OAuth client and redirect URI on the new deployment. The email code needs a Resend account and DNS records for a sending domain on `next-session.link`. Both need Michael. The hosting/auth ticket should confirm them and say whether Google's consent screen can show `next-session.link` on the free Convex plan.
- **Abuse of anonymous creation.** One click creates a user and a group. The spec should pick a limit, for example the Convex rate-limiter component keyed on a client fingerprint, plus cleanup of inactive anonymous groups by a cron job.
- **Merge mechanics.** The spec should decide between a claim code and a `createOrUpdateUser` callback after checking Convex Auth's `signIn` internals.
- **Leaked secrets in OmniGM history.** `Silthus/OmniGM` (private, archived) has `apps/scheduling/.env.scheduling` with secret values committed in `be62469e`. If any of those credentials are still live (the Better Auth secret, the database URLs, the Discord and Google OAuth secrets, the Vercel tokens), Michael should rotate them.
