# Proof for #21 (UI: player surface), PR #43 head 667b20d

- `logs/red-unit.txt`: the four first test files fail on `origin/main` (modules missing). `logs/green-unit.txt`: they pass.
- `logs/red-r1.txt` … `logs/red-r4.txt`, `logs/red-delta2.txt`: each qa-swarm round's new tests failing before its fix.
- `logs/mutant-optimistic.txt`: removing the optimistic answer update fails the e2e "taps and Fill Rest show at once" test.
- `logs/check.txt`: `bun run check` on the head (35 files, 418 tests).
- `logs/e2e.txt`: `e2e/player.spec.ts` against the local backend, with `PLAYER_SCREENSHOTS=1` (15 tests).
- `screenshots/`: Playwright at 390 and 1440 px, light and dark: join, calendar with Answers and a Session, first-visit hint, done card, past month read-only, unknown link.
