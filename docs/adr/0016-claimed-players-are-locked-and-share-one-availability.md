# Claimed Players answer only through their Account, and an Account has one availability

An Account has one set of Answers, shared by every Group where it has a Claimed Player, so a player enters their availability once. To make that safe, only the Account answers as its Claimed Player: the name picker locks a Claimed Player, and the server refuses answers and answer reads for it from anyone else. A Session that one Group schedules makes its Accounts read busy on that night in their other Groups.

Michael on 2026-11-28: "Make it so that players with an account automatically share their availability across all groups they are part of. So they only need to enter their availability once." And: "Claimed player accounts for a group cannot be picked by non signed in players and are indicated with a signin lock icon and on choosing them redirect to signin."

Without the lock, anyone holding one Group's Share Link would change the player's availability in every other Group. ADR-0004 accepts that trust inside one Group, not across all of an Account's Groups.

This amends ADR-0004 and ADR-0010: the Share Link still opens a Group and answers as any unclaimed Player, but a Claimed Player answers only through its Account. Players without an Account keep the one-link flow unchanged.

## Considered Options

- **Copy each answer into every linked Group, with per-Group overrides.** Every reader stays as it is, but a player has to understand which Group says what, and each row has to remember where it came from.
- **A one-time copy when a second Group opens.** Cheap, but later changes don't follow, so the player enters everything twice anyway.
- **Keep the Share Link answering as Claimed Players.** No sign-in step, but one Group's link edits a player's availability everywhere.

## Consequences

- A signed-out player has to log in before answering as their Claimed Player, and a GM can't fill in answers for one.
- A wrong Account can keep a name by mistake, for example on a shared device. The GM unlocks it from the Roster, which keeps the Player and its Answers and stops that Account from taking it back by answering.
- Claiming moves a Player's Answers onto the Account, and releasing copies them back, so the Group keeps them.
- Accounts already in several Groups take the most cautious Answer (busy over maybe over free) where their Groups disagree.
- A night blocked by another Group's Session is never written into the Account's Answers. It follows the published Session, so an undone or cancelled Session leaves no trace.
