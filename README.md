# Proof for #19 (PR #44): UI: GM calendar and scheduling

- `screenshots/`: Playwright screenshots of the running app against the local Convex backend, at 390 and 1440 px, light and dark:
  - `heatmap`: five Players with one bar each
  - `day-selected`: who is free on a night
  - `scheduled-session`: the scheduled night selected
  - `current-month`: today and dimmed past days
  - `month-navigation`: Next stopped at the last month of the Booking Window
  - `many-players`: twelve Players, so the cells show counts
- `logs/red-*` and `logs/green-*`: each test seam failing before its change and passing after it, for the build slices (1 to 5) and for every qa-swarm round (`r1` to `r4`, plus `delta`).
- `logs/gate-final.txt` and `logs/bun-run-check-final.txt`: `bun run check` on the final head, 407 tests.
