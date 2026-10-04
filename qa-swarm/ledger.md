# qa-swarm ledger: PR #52 (ticket #51)

Goal: close #51: (1) fix the flaky PlayerCalendar refusal test deterministically, (2) Safari IME keyCode 229 on NameForm/GroupScreen Escape via Join's helper, (3) prefill the join field from an unmatched long-Roster filter, (4) doc drift in spec.md/DESIGN.md, (5) one parameter style in src/lib/storage.ts.
Base: origin/main. Danger areas: none (storage.ts exported signatures changed; keys unchanged).

## Round 1 (HEAD 1a8271a)
- GPT lane (correctness, security, production, design, tests, adversary): all six died on Codex 429 (quota). Substituted with Opus in round 2.
- F1 | Opus fresh-eyes + Opus UI | Join.tsx:45 | minor | NAME_TAKEN refusal pins the taken chip, unmatchedFilter -> "", join field empties | FIX: setTypedName(name) on submit; red/green test "keeps the carried name when the Group refuses it as taken" | commit see r1 fix
- F2 | Opus UI | Join.tsx:174 | nit | "No names match. Add yours below." while the name is already below | REJECT: the copy still names the next step (tap Join to add it); no named standard broken; copy change is product taste
- (r1 fix commit: ac4ffeb)

## Round 2 (HEAD ac4ffeb), all eight lenses on Opus (Codex still 429)
- correctness, security, production, design, adversary, fresh-eyes: (none)
- T1 | Opus tests | Join.test.tsx:215 | nit | stub refused "A na", which the real backend accepts | FIX: realistic "Zoë  Ölund" (double space; filter misses, normalizeName collapses) | 5723ac7
- T2 | Opus tests | Join.test.tsx:185 | nit | two identical IME Enter tests | FIX: one it.each | 5723ac7
- U1 | Opus UI | Join.tsx:45 | minor | live roster gains a name containing the filter -> carried name clears | REJECT (call recorded): derived carry is deliberate; the new matching chip shows; correctness + adversary lenses judged the same trigger intended; alternative (carry on filter change) adds a second source of truth for a rare race

## Round 3 (HEAD 5723ac7), eight lenses on Opus (Codex 429)
- correctness, security, production, UI: (none)
- D1 | Opus design | Join.tsx:32 | nit | typedName also holds the submitted name | FIX: rename to ownedName | c923b28
- T3 | Opus tests | Join.test.tsx:273 | minor | ?? -> || mutation survives | FIX: test "lets the Player clear a carried name" (red under ||) | c923b28
- FE1 | Opus fresh-eyes | Join.tsx:46 | minor | type in field, clear, then filter -> no carry; suggests || | REJECT: || refills a carried name the moment the Player clears it (UI + correctness lenses in r2/r3 judged ?? correct); trigger rare
- A1 | Opus adversary | Join.tsx:41 | nit | roster 13->12 while typing hides the filter and empties carry | REJECT under settled (3) (derived carry, single source of truth); adversary itself recommends accepting

## Round 4 (HEAD c923b28), Opus (Codex 429)
- security, production, design: (none)
- correctness, tests, adversary, fresh-eyes, UI: Opus 429 (rate limit) at ~10:25 UTC; retry after 5 min
- retry at ~17:05 UTC: correctness, tests, adversary, fresh-eyes, UI: (none)
- ROUND 4 CLEAN on c923b28. CI check + e2e green.
