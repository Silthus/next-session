# Dropping `sessionMailStates` while it holds rows

Checked on a local Convex backend (`precompiled-2026-09-28-5c7cb5b`, CLI 1.46.0) on 2026-10-16, in a scratch copy of the integration tip `ee0fe41`.

1. Pushed the schema of `ee0fe41`, which still defines `sessionMailStates`, and ran a probe mutation that inserted one Group, one Session and one `sessionMailStates` row.

   ```
   ✔ 08:48:46 Convex functions ready! (2.59s)
   ✔ Finished running function "dropProbe:seed"
   ```

2. Removed `sessionMailStates` from `convex/schema.ts` and pushed again. Convex accepted the push and deleted only the index:

   ```
   ✔ Deleted table indexes:
     [-] sessionMailStates.by_groupId_and_date   groupId, date, _creationTime
   ✔ 08:48:48 Convex functions ready! (595.62ms)
   ```

3. Ran a probe mutation that reads and deletes the table's rows through an untyped database writer, twice. The row had survived the schema drop, and the second run found nothing:

   ```
   [CONVEX ?(dropProbe:drain)] [LOG] 'drained 1, left 0'
   [CONVEX ?(dropProbe:drain)] [LOG] 'drained 0, left 0'
   ```

So Convex does not refuse to drop a non-empty table. S1a removes `sessionMailStates` from the schema, and `backfill.emptyRetiredMailStates` drains the leftover rows the same way after the deploy. The S1a schema itself (with `state`, `changedAt` and `published` on `sessions`) also pushed cleanly onto that same backend, which still held the dropped table.
