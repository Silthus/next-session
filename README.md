# Proof for #51

- `red-under-load.log`: the old refusal test, 10 runs with 24 busy-loop CPU hogs: 4 failed with CI's error (`Unable to find role="button" and name "Monday, October 5: Busy"`).
- `green-under-load.log`: the fixed `PlayerCalendar.test.tsx` (25 tests), 30 runs under the same load: 30 passed.
- `red-ime-nameform.log` / `red-ime-e2e.log` / `red-ime-e2e-groupscreen.log` → `green-ime-e2e.log`: Safari's IME Escape (`keyCode` 229), red in NameForm, then red in GroupScreen alone, then green.
- `red-filter-to-join.log` / `red-filter-to-join-e2e.log` → `green-filter-to-join.log` / `green-filter-to-join-e2e.log`: the carried name on the long-Roster join screen.
- `gate-check.log` (`bun run check`, 611 tests) and `gate-e2e.log` (45 passed, 13 opt-in screenshot specs skipped).
- `screenshots/`: the long-Roster join screen with an unmatched filter, 390 and 1440 px, light and dark.
