# Proof for ticket #45 (UI polish)

- PR #48 (Sheet, Save retry, landing, compact ShareLinkCard): logs in `logs/pr48`, qa-swarm ledger in `ledger/pr48-ledger.md`.
- PR #49 (shared storage, errors and helpers, Toast live region, long Roster filter): logs in `logs/pr49`, ledger in `ledger/pr49-ledger.md`.
- `screenshots/`: Playwright, local backend, 390 and 1440 px, light and dark.
  - `sheet--*`: the Save sheet with the Close button, with the backdrop dimmed in dark mode
  - `share-compact--*`: the compact ShareLinkCard with its share buttons (GM rail)
  - `join-long-roster--*`, `join-long-roster-filtered--*`: the long-Roster join screen
  - `link-created--*`, `landing--*`, `log-in-error--*`, `hint--*`, `done--*`: regression context

Red logs come before green logs for each test-first step.
