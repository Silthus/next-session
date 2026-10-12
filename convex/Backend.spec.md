# Backend

The Convex backend: every query, mutation and HTTP route the web app and the outside world call, and the scheduled work behind them.

## entrances
- groups.mine: a GM lists the Groups they own
  handler: mine in groups.ts
  trust: signed-in user
- groups.get: a GM reads one of their Groups; a foreign or missing id reads as null
  handler: get in groups.ts
  trust: signed-in user
- groups.create: a GM creates a Group with a fresh Share Token
  handler: create in groups.ts
  trust: signed-in user
- groups.rename: a GM renames a Group they own
  handler: rename in groups.ts
  trust: signed-in user
- groups.remove: a GM deletes a Group they own and its children
  handler: remove in groups.ts
  trust: signed-in user
- groups.rotateShareToken: a GM rotates a Group's Share Token, stopping the old Share Link
  handler: rotateShareToken in groups.ts
  trust: signed-in user
- groups.undoRotateShareToken: a GM undoes a rotation within 30 seconds
  handler: undoRotateShareToken in groups.ts
  trust: signed-in user
- schedule.month: a GM reads one month of a Group's Roster, Answers and Sessions
  handler: month in schedule.ts
  trust: signed-in user
- roster.addPlayer: a GM adds a Player to a Group they own
  handler: addPlayer in roster.ts
  trust: signed-in user
- roster.renamePlayer: a GM renames a Player of a Group they own
  handler: renamePlayer in roster.ts
  trust: signed-in user
- roster.removePlayer: a GM removes a Player and their Answers
  handler: removePlayer in roster.ts
  trust: signed-in user
- sessions.schedule: a GM picks a date in the Booking Window as a Session
  handler: schedule in sessions.ts
  trust: signed-in user
- sessions.unschedule: a GM cancels a Session
  handler: unschedule in sessions.ts
  trust: signed-in user
- player.group: whoever holds a Share Link reads its Group's Roster and Sessions
  handler: group in player.ts
  trust: visitor
- player.answers: whoever holds a Share Link reads one Player's Answers for a month
  handler: answers in player.ts
  trust: visitor
- player.join: whoever holds a Share Link adds a name to the Roster; an Account caller claims it
  handler: join in player.ts
  trust: visitor
- player.claim: an Account claims a Player through the Share Link
  handler: claim in player.ts
  trust: signed-in user
- player.release: an Account releases its Claim in a Group
  handler: release in player.ts
  trust: signed-in user
- player.removeFromMyGroups: an Account drops a Group from My groups by releasing its Claim
  handler: removeFromMyGroups in player.ts
  trust: signed-in user
- player.answer: whoever holds a Share Link sets or clears one Player's Answer for one date
  handler: answer in player.ts
  trust: visitor
- player.fillRest: whoever holds a Share Link answers busy for every unanswered date left in the month
  handler: fillRest in player.ts
  trust: visitor
- me.groups: an Account reads My groups
  handler: groups in me.ts
  trust: signed-in user
- me.sessionEmails: an Account reads its Session updates preference
  handler: sessionEmails in me.ts
  trust: signed-in user
- me.setSessionEmails: an Account turns Session updates on or off
  handler: setSessionEmails in me.ts
  trust: signed-in user
- account.me: a caller reads whether they are anonymous and their email
  handler: me in account.ts
  trust: signed-in user
- account.startSave: an Anonymous GM starts a Save and gets a claim code
  handler: startSave in account.ts
  trust: signed-in user
- account.finishSave: an Account redeems a claim code, moving the Anonymous GM's Groups to it
  handler: finishSave in account.ts
  trust: signed-in user
- account.confirmTips: an Account confirms it wants the Tips emails
  handler: confirmTips in account.ts
  trust: signed-in user
- signInOptions.available: anyone reads which sign-in methods are switched on
  handler: available in signInOptions.ts
  trust: visitor
  control: none — it reads only which sign-in providers are configured in the deployment environment and touches no stored data
- auth routes: Convex Auth's HTTP routes: sign-in, sign-out, OAuth callbacks and token refresh, from anyone on the web
  handler: auth in auth.ts
  trust: visitor
  control: none — the Convex Auth library owns these routes and their token checks; sign-ups pass the project's rate limits in admitAnonymousSignUp and admitAccountSignUp
- expiry sweep: the daily cron deletes Unsaved Groups past their Expiry
  handler: sweepExpiredGroups in cleanup.ts
  trust: operator

## invariants
- owner-only groups: A GM reads or changes a Group, its Players and its Sessions only when they own the Group; another GM's ids read as missing and nothing changes.
  over: every public function of the groups, roster, schedule and sessions modules, called by one GM with another GM's Group, Player and Session ids
  via: every GM-facing function treats another GM's Group, Player and Session as missing and changes nothing
  because: a Group is one table's private plan; without the ownership check any signed-in GM could read or edit another table's Roster, Answers and Sessions, and a refusal that differs from a missing id would let ids be probed
  crossing: signed-in user -> store
  refuted: groupOwnedBy returned the Group without comparing its ownerId -> the oracle failed by name (2026-10-12)
  entrances: groups.mine, groups.get, groups.create, groups.rename, groups.remove, groups.rotateShareToken, groups.undoRotateShareToken, schedule.month, roster.addPlayer, roster.renamePlayer, roster.removePlayer, sessions.schedule, sessions.unschedule
  kinds: read, identity
  checklist: scoped-reads declared as owner-only groups
  checklist: capability-authorization declared as share link scoping
  checklist: redaction dismissed: a foreign id returns null or NOT_FOUND exactly like a missing one, so no partial view of the Group exists to scrub
  checklist: canonical-encoding dismissed: every id passes through ctx.db.normalizeId, and a Group has no second encoding of its identity
  checklist: identity-continuity declared as save never replaces
- share link scoping: A call through a Share Token reads and writes only Players of the Group behind that token's current value; a rotated-away token opens nothing.
  over: every public function that takes a Share Token, called with another Group's Player and with a rotated-away token
  via: every Share Token function reaches only Players of the Group behind its current token
  because: the Share Link is the only Player credential (ADR-0004); if it reached another Group's Players one leaked link would expose or overwrite every Group, and rotating it would not stop a link the GM revoked
  crossing: visitor -> store
  refuted: playerOnShareLink stopped checking the Player's Group -> the oracle failed by name (2026-10-12)
  entrances: player.group, player.answers, player.join, player.answer, player.fillRest
  kinds: read, credential
  checklist: scoped-reads declared as share link scoping
  checklist: capability-authorization declared as share link scoping
  checklist: revalidated-permission dismissed: no Share Token work is deferred; each call resolves the token inside its own transaction
  checklist: message-authenticity dismissed: the Share Token is a bearer credential, not a signed message
  checklist: encrypted-storage dismissed: the GM must be able to copy the Share Link again, so the token is stored readable by design (ADR-0004); rotation revokes it
  checklist: key-rotation-compatibility dismissed: rotating the Share Token deliberately stops the old link; no reader keeps using it
  checklist: redaction dismissed: a scoped-out call returns null or NOT_FOUND with nothing of the other Group in it
  checklist: separation-of-duties dismissed: the player surface has one role; whoever holds the link answers as any Player by design (ADR-0010)
- save never replaces: Save adds every Group of the Anonymous GM to the Account and leaves the Account's own Groups exactly as they were.
  over: an Account that already owns Groups redeeming the claim code of an Anonymous GM that owns a Group
  via: adds to an Account's Groups and never replaces them
  because: signing in to keep a group must never cost an Account its existing tables (ADR-0003); a Save that replaced instead of merged would delete a GM's Groups behind a sign-in
  crossing: signed-in user -> store
  refuted: moveGroups deleted the Account's own Groups first -> the oracle failed by name (2026-10-12)
  entrances: account.finishSave
  kinds: identity
  checklist: capability-authorization dismissed: the claim code is single use, hashed and expires after ten minutes; its acceptance is covered by the account tests, not by this merge rule
  checklist: canonical-encoding dismissed: the claim code is compared by its hash and has one encoding
  checklist: identity-continuity declared as save never replaces
- no personal data to posthog: Every backend event and log sent to PostHog carries no Group name, Player name, Share Token, claim code or email.
  over: every event and log a full journey sends: create a link, rename, rotate, join, schedule, Save, claim, release and the expiry sweep
  via: sends no Group name, Player name, Share Token, claim code or email in any event or log
  because: Next Session shares its PostHog project with Lonir and promises in the Privacy Policy to send no names or credentials; a leaked Share Token in an event would hand out a Group
  crossing: store -> egress
  refuted: toPostHogEvent added the actor's email to every event -> the oracle failed by name (2026-10-12)
  kinds: output
  checklist: redaction declared as no personal data to posthog
  checklist: destination-confinement dismissed: send posts only to the fixed PostHog EU host constant, never to a caller-supplied address
  checklist: commit-ordered-effects dismissed: track schedules send with ctx.scheduler.runAfter inside the mutation, and Convex drops what an uncommitted mutation scheduled
  checklist: circuit-breaker-policy dismissed: telemetry is fire and forget with a ten second timeout; a PostHog outage drops events and never blocks the product
  checklist: declared-target-coverage dismissed: there is one target, PostHog
