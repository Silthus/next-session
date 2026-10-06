# Review for #81

Codex adversarial-review returned 429 twice (codex-review.log, codex-review-retry.log). Per the dispatch, one Opus 5.5 fresh-eyes sub-agent reviewed instead.

No high or medium findings. Low findings:
1. The guard only checked `bg-maybe`; `fill-`/`stroke-maybe` would slip past. Fixed: the regex is `(?:bg|fill|stroke)-maybe`.
2. The allowlist exempts all of `PlayerCalendar.tsx`. Rejected (YAGNI): it is the one tile with ink text and its own floor; tighten if a second maybe graphic lands there.
3. The test name claims 3:1 while the floor lives in "keeps the maybe bar visible on a calendar cell". No change: together they pin it.
