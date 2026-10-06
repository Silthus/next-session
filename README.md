# Proof for #88

- `red.log`: the new storage and env tests failing before the change.
- `green.log`: the same tests passing after.
- `gate.log`: `bun run check` on the final tree (70 files, 1047 tests).
- `e2e.log`: player, smoke and landing e2e specs (31 passed, 9 opt-in screenshots skipped).
- `screenshots/before` and `screenshots/after`: "Nothing here", "This link no longer works" and "Something broke" at 390 px, light and dark, rendered by the throwaway harness in `harness/` (not committed to the app). `screenshots/compare.txt`: every after PNG is byte-identical to its before.
