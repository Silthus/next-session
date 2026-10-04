# Ledger PR #48
Round 1 on 8439d3e: dispatched
## Round 1 (8439d3e) triage (all lanes returned FINDINGS + full COVERED)
- R1-1 save.ts:34 Account retry with no pending claim returns success; after CLAIM_INVALID the next retry says "Saved" though nothing moved. Sources: correctness, production, adversary, fresh-eyes, UI. FIX: Account + no pending claim throws CLAIM_INVALID; sheet maps CLAIM_INVALID to a terminal "save expired" message.
- R1-2 Landing.tsx:60 / save.ts:28 retry ignores edited email/mode; landing says "Saved to B" while Groups went to A. Sources: correctness, adversary, fresh-eyes, UI (major). CALL: once signed in (status account) the Save sheet shows "Signed in as {email}" finish step with no credential fields; confirmation uses that email. Alt: lock fields readOnly.
- R1-3 Sheet.tsx:69 Close x is first focusable -> steals opening focus. Source: UI. FIX: render x after content, positioned top-right.
- R1-4 Sheet.tsx:66 long unbroken group name overflows title, pushes x out. Source: UI. FIX: min-w-0 break-words.
- R1-5 Sheet.test.tsx:112 repeated Escape covered only in jsdom. Source: tests. FIX: Chromium e2e holding the sign-in, Escape x3, sheet stays modal.
- R1-6 landing.spec.ts:221 backdrop only asserted in dark. Source: tests. FIX: assert light too.
- R1-7 landing.spec.ts:159 retry e2e doesn't prove Group moved. Source: tests. FIX: log in from fresh context, land on the Group.
- Security, design: none.
Round 2 on dc054ea: dispatched 08:21
## Round 2 (dc054ea) triage (all lanes FINDINGS + COVERED)
- R2-1 Landing.tsx:79 LoggedInAs mounts while status still signedOut (logIn resolves before Convex confirms) -> false "No groups here yet", double announce. Source: fresh-eyes. FIX: show only when status account && groups?.length === 0 && sheet closed.
- R2-2 AccountSheet.tsx:65 finish step submits placeholder password; path chosen separately by isAccount. Source: fresh-eyes (type-safety nit). FIX: separate finishPendingSave()/onFinish path; saveGroups back to anonymous-only.
- R2-3 copy: "Logged in as" vs "You're signed in as" vs header "Signed in as". Source: UI nit. FIX: "Signed in as {email}." everywhere.
- R2-4 AccountSheet.tsx:189 finish paragraph long group name overflow. Source: UI nit. FIX: break-words.
- R2-5 Sheet.test.tsx:57 no keyboard activation test for Close. Source: tests. FIX: Tab + Enter test, blocked while not dismissible.
- GPT correctness/security/production/design/adversary: none.
Round 3 on 3849abd: dispatched 08:37
## Round 3 (3849abd) triage — GPT 6/6 clean
- R3-1 GroupScreen.tsx:128 closing the finish step after a failed move: fallback redirects, claim stays pending, Group missing until reload (lost after TTL). Sources: fresh-eyes, UI. CALL: closing the finish step finishes the Save in the background (onFinish), so the screen holds while it runs and confirms as usual; alt: hold the fallback while a claim is pending (risks a stuck loading screen).
- R3-2 AccountSheet.tsx:209 after CLAIM_INVALID "Finish saving" stays the primary action and only repeats the error. Source: UI. FIX: CLAIM_INVALID swaps the primary action for Close.
- R3-3 Sheet.tsx:15 `dismissible` gates only the x; AccountSheet guards twice. Source: fresh-eyes nit. FIX: dismissible gates every dismiss path (native close just re-shows); AccountSheet passes onClose straight.
- R3-4 DESIGN.md:100 still says compact ShareLinkCard has no share row. Source: fresh-eyes nit. FOLLOW-UP (DESIGN.md outside write scope).
- R3-5 Sheet.tsx:37 re-show after native close replays the entry animation. Source: UI nit. REJECT: only on the repeated-Escape mid-request path; the sheet returns in place within a frame; suppressing animations adds state for a cosmetic edge.
Round 4 on 6aef4e4: dispatched 08:54
## Round 4 (6aef4e4) triage. GPT lane: security + tests ran; correctness/production/design/adversary died on Codex usage limit (429, "try again Oct 10"); substituted with Opus on the same briefs (gap).
- R4-1 AccountSheet.tsx:39/59 first-attempt CLAIM_INVALID while busy is lost; finish step shows "Finish saving" under the expired copy. Sources: fresh-eyes, correctness(sub), adversary(sub), design(sub, simplification). FIX: drop FinishStep.claimExpired; FinishSave reads failure?.claimExpired; dismiss always finishes in background from the finish step (harmless when expired).
- R4-2 Landing.tsx:63 after CLAIM_INVALID on the landing the dead link stays, no Create path, Save loops. Source: UI. FIX: on close after an expired claim, reset the landing to idle (returning-GM redirect or Create your link).
- R4-3 Landing.tsx:70/60 typed email casing vs normalized gm.email. Source: correctness(sub). FIX: render gm.email for "Signed in as" and "Saved to".
- R4-4 AccountSheet.test.tsx:235 wrap asserted through class names. Source: tests. FIX: drop the class-coupled assertion.
- R4-5 save.ts resumePendingSave duplicates finishPendingSave. Source: design(sub). FIX.
- R4-6 landing.spec.ts helper duplication (fillSaveSheet/saveToNewAccount, logIn steps, WS proxy). Source: design(sub). FIX.
- R4-7 useGm settledStatus ref only compared to loading; Sheet CloseButton dead shrink-0. Source: design(sub) nits. FIX.
- production(sub), security: none.
Delta on 6aef4e4..9fa554d: dispatched 09:10
## Delta 1 (6aef4e4..9fa554d) triage — correctness/adversary (Opus sub for GPT) + fresh-eyes (Opus)
- D1-1 Landing.tsx:69 reset applied only in onClose; a background finish that expires after dismissal leaves the dead link. Sources: both. FIX: derive `if (claimExpired && sheet === null) startOver()` in render; e2e "expires after the GM dismissed the retry" red on 9fa554d, green after.
- D1-2 e2e targeted the x via .last(), primary Close untested. Source: correctness/adversary. FIX (.first() = primary; x path covered by the new dismiss test via Escape).
- D1-3 wrap unit test no longer tests wrapping. Source: correctness/adversary. FIX (deleted).
- D1-4 "Saved to" casing not e2e-covered. Source: fresh-eyes. FIX (types GM… and expects the lowercase email).
Delta 2 on 9fa554d..068f467: dispatched 09:17
## Delta 2 (9fa554d..068f467) triage — fresh-eyes clean; correctness/adversary (Opus sub) one minor
- D2-1 Landing.tsx:37 reopen during a dismissed background finish that then succeeds; dismissing again runs a second finish, CLAIM_INVALID wipes the saved state via startOver. FIX: reset only when !saved; onFinish resolves at once once saved. No unit seam for the container race; gate + landing e2e green (gap: race not automated).
