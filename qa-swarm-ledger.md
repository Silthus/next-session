# qa-swarm ledger — PR #50 (ticket #23)

Goal: e2e/production.spec.ts (§10 seven steps) + e2e:prod against BASE_URL; not in check/CI e2e.
Base: origin/main 249b7ca. Split: none (196 lines).
Danger: playwright.config.ts testIgnore; prod writes; password handling.

## Round 1 — HEAD 9af390b
Lanes: GPT correctness, security, production, design, tests, adversary (Codex companion); Opus fresh eyes. All COVERED 4/4 files.
- R1-1 production.spec.ts:50 password recorded by fill in trace/report (all 7 lanes) -> FIX 14541d1: exposeFunction binding + Reflect.set, trace snapshots off. Observed: synthetic marker absent from traces/report; real prod trace has no "password" field.
- R1-2 production.spec.ts:64 goto follows apex 301 to Lonir (GPT sec, prod, adv; Opus) -> FIX 14541d1: request.get("/", maxRedirects 0) == 200 first. Observed: apex red at 119ms (red-5).
- R1-3 production.spec.ts:155 cleanup skipped on failure (GPT corr, prod, design, tests, adv; Opus) -> FIX 14541d1: afterEach deleteGroup when leftover. Observed: step 6 broken on purpose, afterEach deleted (red-4 + trace).
- R1-4 production.spec.ts:103 bars not asserted (GPT tests, minor) -> FIX 14541d1: expectBar on [data-bar].
Checks on 9af390b: pending at triage time.

## Round 2 — HEAD 14541d1
Lanes: 6 GPT + Opus fresh eyes; all COVERED 4/4. Security, Design: (none).
- R2-1 spec:149 month rollover across UTC month end (GPT corr minor, Opus nit) -> FIX 6351d7e: GM opens groupPath?month=nextMonth.
- R2-2 spec:117 Share Link host discarded (GPT tests major) -> FIX 6351d7e: assert shown host == BASE_URL origin, Player opens shown link, rail code toHaveText exact.
- R2-3 spec:182/192 password in failure aria snapshot (Opus major) -> FIX 6351d7e: clear field via evaluateAll right after submit. Observed: synthetic stuck sheet, error-context has marker without clear, none with clear. Real run green (save + login still work).
- R2-4 spec:112 cleanup armed only after step 1 confirmation (GPT prod major, adv minor) -> REJECT: before step 5 the Group is Unsaved and expires after 30 quiet days (docs/spec.md §5.5, convex/cleanup.ts); permanent data starts at step 5's save, by which point leftoverGroup is set (spec step 1).
CI on 9af390b: check pass, e2e pass.

## Round 3 — HEAD 6351d7e
Lanes: GPT correctness, security, production, design, tests: (none). GPT adversary: 429 twice -> substituted with Opus (gap). Opus fresh eyes: (none).
- R3-1 spec:15 per-worker identity reused under --repeat-each / a second test() (Opus-adversary minor) -> REJECT: e2e:prod is one walk-through per run by design (§10); separate runs get fresh stamps (three back-to-back runs green, logs green-3-run1..3); repeat-each against production is not an intended use.
ROUND 3 CLEAN on 6351d7e. CI on 6351d7e: check pass, e2e pass.
