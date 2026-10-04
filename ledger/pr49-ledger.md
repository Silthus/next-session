# Ledger PR #49
Round 1 on 0d29ae0: dispatched
## Round 1 (0d29ae0) triage (all lanes returned FINDINGS; production COVERED list empty but its finding names files; accepted)
- R1-1 Join.tsx:40 stale filter hides chips after roster drops to <=12. Sources: correctness, production, adversary, fresh-eyes, UI. FIX: apply filter only while filterable; rerender test 13->12.
- R1-2 Join.tsx:203 stroke letters (ø ł đ æ ß) don't fold -> duplicate Player. Source: UI. FIX: fold table + test.
- R1-3 docs/spec.md:294,332 still name playerIdentity.ts. Source: fresh-eyes, UI. FOLLOW-UP (docs outside write scope).
- Security, design, tests: none.
Round 2 on f8b968d: dispatched 08:21
## Round 2 (f8b968d) triage
- R2-1 GroupScreen.tsx:305 Toast live region lives inside GroupSurface, remounts during Save (GroupLoading), "Saved" toast mounts with region. Source: UI (minor). FIX: render Toast (+hold wrapper) in GroupScreen outside surfaceFor.
- R2-2 Join.tsx:157 new Player types name twice on no-match. Source: UI nit. FOLLOW-UP (UX beyond the goal; auto-copying filter text into the join field is a product call).
- R2-3 NotFoundScreen.tsx:30 page kind now focuses heading (undeclared, untested); `type Screen` shadows DOM Screen. Source: fresh-eyes nit. FIX: assert focus in page test, declare in PR, rename type.
- R2-4 e2e/helpers.ts:7 E2E_CONVEX_URL vs hardcoded server URL. Source: fresh-eyes nit. REJECT: setting the variable without moving the server (scripts/e2e-server.ts:54) breaks every spec before and after this PR; with a patched server, all specs now agree on the auth key.
- R2-5 PlayerScreen.tsx:13 lib/storage import placement. Source: fresh-eyes nit. FIX.
- R2-6 player.spec.ts:532 screenshot loop duplicates captureEveryVariant. Source: fresh-eyes nit. FIX (reuse).
- GPT lanes: all none.
Round 3 on 56a5184: dispatched 08:37
## Round 3 (56a5184) triage — GPT 6/6 clean
- R3-1 e2e/player.spec.ts:288 unscoped getByRole("status") now matches DoneCard + always-mounted Toast region during an optimistic Fill Rest -> strict-mode failure, not retried (flake). Source: fresh-eyes. FIX: scope status locators to the toast text / live region in every spec.
- R3-2 GroupScreen.tsx:307 toast position derives the open day separately from GroupSurface. Source: fresh-eyes nit. REJECT: both derive from the URL day; they differ only while the month loads, when no day sheet shows; unifying lifts surface state up for a momentary position.
- R3-3 Landing.tsx:9 lib/storage import order. Source: fresh-eyes nit. FIX.
- R3-4 Join.tsx:157 enterKeyHint="search" does nothing on Enter. Source: UI nit. FIX: enterKeyHint="done" and Enter blurs the field.
Round 4 on 110bde0: dispatched 08:54
## Round 4 (110bde0) triage. GPT lane: all six died on Codex usage limit (429); substituted with Opus on the same briefs (gap).
- R4-1 gm-rail.spec.ts:264 local toastRegion shadows the helper. Sources: fresh-eyes, correctness(sub), design(sub), tests(sub), adversary(sub). FIX.
- R4-2 Join.tsx:159 Enter blur ignores IME composition. Source: UI. FIX (isComposing guard, repo precedent NameForm.tsx:66).
- R4-3 storage.test.ts:124 nudge key not pinned. Source: tests(sub). FIX.
- R4-4 index.css reduced-motion rule untested. Source: tests(sub). FIX (e2e computed style under emulated reduced motion).
- R4-5 GroupScreen.tsx:316 hold-on-focus wiring untested end to end. Source: tests(sub). FOLLOW-UP (pre-existing gap; hold/release unit-tested in useToast.test; wiring moved unchanged).
- R4-6 NotFoundScreen.test repeated bodies; React.ReactElement global; ownsTitle flag. Sources: tests(sub), design(sub) nits. FIX.
- R4-7 ToastMessage action/onAction independent optionals. Source: design(sub) nit. FIX (action?: {label, run}).
- R4-8 storage.ts two parameter conventions. Source: design(sub) nit. REJECT for this PR: the move keeps every signature (goal: behaviour-identical move); unifying is a follow-up.
- security(sub), production(sub): none.
Delta on 110bde0..daf6d49: dispatched 09:10
## Delta 1 (110bde0..daf6d49) triage — correctness/adversary (Opus sub for GPT) + fresh-eyes (Opus)
- D1-1 Join.tsx:159 Safari IME Enter has isComposing false, keyCode 229. Sources: both. FIX (isComposing helper with keyCode 229; red/green). NameForm.tsx:66 has the same gap for Escape: FOLLOW-UP (outside write scope).
- D1-2 smoke.spec.ts reduced-motion probe passes on the default "1". Sources: both. FIX (assert "infinite" without reduced motion first). Test-only.
- D1-3 __root.tsx duplicate <title> on 404. Sources: both (nit). REJECT: every screen that renders its own React 19 <title> (Join, PlayerCalendar, NotFoundScreen link kind) coexists with the root head title by the #21 call; dropping the branch would only make the two differ.
Delta 2 on daf6d49..b5595cb: dispatched 09:17
## Delta 2 (daf6d49..b5595cb): both lenses clean -> clean round under the round-4 churn rule.
- CI on b5595cb: `check` failed once on PlayerCalendar.test "keeps focus ... refused Fill Rest rolls back" (file untouched beyond the chevron import; passes 6/6 locally) -> infra/flake, one rerun of failed jobs requested.
