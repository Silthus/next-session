# Sessions publish a snapshot after the Undo window, and every outside channel reads only the snapshot

A Session row carries its live state plus a `published` snapshot: what the outside world was last told about it. Every change goes through one lifecycle module, `convex/sessionLifecycle.ts`. Thirty seconds after the latest change, the module settles the row. It publishes a new revision only when the snapshot the row means now differs from the published one. Session mail, and later calendar invites, feeds, downloads and Reminders, read only `published`, so the Undo window holds for push and pull alike. Stale work is judged by revision: a send job drops itself when a newer revision has been published. Undo, a burst of edits, late jobs and per-recipient sends therefore need no special cases. Cancel keeps the row, unless it was never published (#124, #126).

The Cancelled Session (S1, #139) ships the snapshot as `{ state, revision }`. The Group's Time and place (S2, #151) widens it to `{ state, start, end, location?, summary, revision }`, with `backfill.widenPublishedSnapshots` filling existing rows at the same revision. S3 routes a rename through the lifecycle's `groupChanged`, and the calendar `UID` and `SEQUENCE` arrive with the invites (S4). The calendar `UID` is `<sessionId>@next-session.link` for the row's whole life, which is why cancel and Schedule again keep the row and its id.

## Considered Options

- **The edge-triggered latest-change table keyed by Group and date (`sessionMailStates`).** It was what shipped. It can't hold a sequence for a deleted row, can't express time or settings edits, and gives pull channels no Undo window.
- **Judging staleness by `SEQUENCE`.** A per-recipient invite would then silence other recipients' retries.
- **A per-recipient delivery table.** More exact, but more rows and more code.

## Consequences

- `sessionMailStates` goes away. Convex accepts dropping a table that still holds rows, so the schema drops it at once and a one-off backfill empties it.
- The Session row grows `state`, `changedAt` and `published` now, and `startTime`, `lengthMinutes`, `location` and `sequence` with later specs.
- Existing rows are backfilled as published at revision 0, so the first change after the deploy announces correctly. A later widening of the snapshot needs its own in-place backfill at the same revision, or the first settle after it mails everyone again.
- `settle` runs whether or not mail is configured, so `published` means "past the Undo window" in every deployment.
- A Group deletion still deletes its Sessions outright until the invites ship. S4 makes it cancel published entries first.
