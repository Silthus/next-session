# Proof for #76: browser events and logs at the UI call sites

Red runs fail before the change, green runs pass after it, per slice:

| Slice | Red | Green |
| --- | --- | --- |
| `errors.ts` reports uncoded Convex failures | `logs/red-errors.log` | `logs/green-errors.log` |
| `ShareLinkCard` copies and shares, Copy fallback logs | `logs/red-share-link.log` | `logs/green-share-link.log` |
| Landing surface | `logs/red-landing.log` | `logs/green-share-link.log` |
| `save.ts` and `keep.ts` (`save_started`, recovery logs) | `logs/red-save-keep.log` | `logs/green-save-keep.log` |
| `AccountSheet` (`sign_in_failed`, uncoded reports) | `logs/red-account-sheet.log` | `logs/green-account-sheet.log` |
| `PlayerCalendar` (`answers_started`, `fill_rest_used`, `keep_group_started`) | `logs/red-player-calendar.log` | `logs/green-player-calendar.log` |
| `/me` (`MyGroups`, `useRemoval`) | `logs/red-me.log` | `logs/green-me.log` |

Gate on the final tree: `logs/check.log` (`bun run check`) and `logs/e2e.log` (full local e2e, telemetry off).
