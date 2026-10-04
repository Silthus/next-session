# qa-swarm ledger PR #46 (ticket #20)
Goal: GM rail per #20. Base origin/main. Split: one PR (call; a stack was the alternative, ~1400 non-test lines).
## Round 1 on 7943257
Lanes: GPT correctness, security(clean), production, design, tests, adversary; Opus fresh-eyes, UI. All COVERED complete.
### Fixed (f807a0d)
- Popover onBlur closed on null relatedTarget (disabled busy button, clicks on panel text) [UI major, fresh-eyes] -> close only when focus moves to a known outside element; pointerdown handles outside clicks. Red: GroupSwitcher.test "stays open when focus drops".
- Popover Escape needed focus inside (Safari/Firefox mac) and leaked to window day listener [fresh-eyes, UI] -> document keydown while open, stopPropagation.
- Players kebab menu clipped by overflow list [UI major, adversary major] -> CALL: inline row actions (alt: portal/fixed popover).
- Empty-roster add form autofocus stole focus / broke phone tabs [UI major, fresh-eyes] -> autoFocus only when GM opens it; + Add hidden while open.
- Escape in AccountSheet also closed selected day [fresh-eyes, UI] -> skip when target inside dialog. e2e red on 7943257.
- Toasts: SavedNotice separate (position, stacking, timer reset); rotate/session race [design major, correctness, UI, fresh-eyes] -> CALL: single useToast owned by GroupScreen, passed to useSessionActions/useRailActions (alt: arbitrate two hooks).
- Rotate double-click double-rotates [adversary, production, UI] -> in-flight guard for rotate/undo. Red: useRailActions.test.
- NameForm Escape while busy [UI] -> ignored while busy.
- RemoveConfirm long name overflow [UI] -> flex-wrap + truncate.
- Delete confirm omits sessions / 0 players before groups load [UI] -> copy names sessions; delete disabled until groups load.
- Players string ids + casts [fresh-eyes nit] -> Players generic over player row.
- BestNights "Free: " empty [fresh-eyes nit].
- Tests: completed Save from header, toast clears phone sheet, delete last group [tests]. useToast unit test covers 5 s + hold.
### Follow-up
- finishSave failing after sign-in strands the claim [production] -> pre-existing save.ts issue (#18 follow-up); useGm's resumePendingSave retries.
- storage keys belong in src/lib/storage.ts [fresh-eyes nit] -> lib/storage.ts not in scope.
### Rejected
- Nudge "Ana joined" when GM added Ana [UI nit]: copy is DESIGN prototype copy (Group.tsx Nudge).
- Playwright clock test for rotate toast lifetime [tests]: useToast.test covers the 5 s lifetime and hold at the unit seam.
## Round 2 on f807a0d
Clean lanes: GPT correctness, design, security. CI check+e2e green on f807a0d.
### Fixed (58419ad)
- Toast survived a Group switch; Undo changed the left Group [fresh-eyes minor, adversary minor] -> useToast(groupId) tags toasts; a toast or late result from another Group is hidden. Red: useToast.test.
- Focus dropped after Remove success, delete Keep, Later, rotate Undo [UI minor, fresh-eyes nit] -> + Add, Delete group, month heading (focusMonthHeading exported from calendar/dayFocus.ts). Red: Players/GroupSwitcher unit, e2e on f807a0d.
- Copied state persisted across rotate [production minor] -> ShareLinkCard keyed by URL.
- Page-level single-toast e2e [tests minor] -> "the newest action owns the only toast".
- Toast.test position assertion echoed the prop [tests nit] -> removed; Playwright geometry check stays.
- Delete question long name overflow [UI nit] -> break-words.
## Round 3 on 58419ad
Clean lanes: GPT production, security. CI green on 58419ad.
### Fixed (cee724a)
- Rotate focus lost by key={shareUrl} remount [Opus fresh-eyes major, UI minor] -> ShareLinkCard resets Copied when url changes (derived state) and stays mounted; e2e keyboard rotate keeps focus. src/ui/ShareLinkCard.tsx edit declared outside scope.
- Stale Group callback overwrote current toast state [adversary, correctness, design] -> show() ignores calls bound to a non-current Group. Red: useToast.test.
- New group twice via Escape+reopen [adversary] -> create guard lifted to GroupSwitcher. Red: GroupSwitcher.test.
- Remove with add form open lost focus [UI] -> heading fallback (RailCard headingRef). Red: Players.test.
- IME Escape cancelled form [UI] -> isComposing check. Red: Players.test.
- Delete navigation pushed history [UI] -> replace.
- RATE_LIMITED copy vs spec §5.4 [fresh-eyes nit] -> "Slow down a moment, then try again." (matches landing).
- Toast data-position unused [nit]; Nudge break-words [nit]; BestNights avatar cap assertion [tests].
### Rejected
- Nudge clock fixed at mount for a tab open 7+ days [correctness minor]: a reload re-evaluates; the banner is advisory and the header Save button stays; adding a visibility clock is YAGNI.
## Round 4 on cee724a
Clean lanes: GPT correctness, design, production, security. CI green on cee724a.
### Fixed (dac8aa5), all verified minor/nit
- IME Escape reached window day listener [Opus fresh-eyes minor, adversary minor, tests "major" (missing test for that minor bug)] -> isComposing check. e2e red.
- Switcher popover under phone day sheet [Opus fresh-eyes, UI minor] -> header z-40.
- Create/delete failure lost after menu closed [UI minor] -> pending+failure lifted to GroupSwitcher. Red: GroupSwitcher.test.
- Completion navigation after GM moved on [adversary "major"; verified minor: needs a slow request plus a manual switch, no data loss] -> useIsMounted guard. Red: useIsMounted.test.
- Focus after Save [UI minor] -> month heading once the month is back. e2e red.
- Back after delete test [tests minor] -> added (passes since round 3's replace).
- nightLabel duplicate formatter [nit] -> calendarDates.ts. Played format vs prototype: rejected (taste, no standard). MenuButton className unused [nit] -> removed.
Churn rule: round 4 had only minor/nit after verification -> focused delta review (1 GPT + 1 Opus) of cee724a..dac8aa5.
## Delta review 1 (cee724a..dac8aa5)
GPT: 1 minor (post-Save focus ran before the dialog closed). Opus: 3 minor (stale failure after the lift, Delete not held during New group, weak IME e2e). No major. Fixed red-first in 71163ef. Second focused delta on dac8aa5..71163ef.
## Delta review 2 (dac8aa5..71163ef)
GPT and Opus both: 1 minor, the same one (Rename unmounts the Popover before onClosed, so a seen failure came back). Fixed red-first in bc3d49f. Delta 3 on 71163ef..bc3d49f.
