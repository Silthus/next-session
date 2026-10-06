# An Account can claim one Player per Group; the Share Token still answers

A Player can create an Account (the same Password provider a GM uses, and Google once it lands) and **claim** their Player: `players.userId` points at the Account. A claim does two things and nothing else. It opens the Group's player page as that Player on any device where the Account is signed in, and it lists the Group on **My groups** (`/me`) with its upcoming Sessions. GM and Player are roles of one Account, not two kinds of user.

The Share Token stays the only credential to read a Group and answer. A Claimed Player is still answerable by anyone who holds the link, exactly as ADR-0004 accepts. Claiming is convenience across devices and Groups, not protection. Lonir ADR-0077 dropped server-side claims because they cost more than the protection they gave; this claim gives no protection and costs one optional field and one index.

How a claim happens:

- Joining with a new name while signed in as an Account claims the new Player in the same mutation. You typed your name, so it is yours.
- Picking an existing name never claims on its own. The player page offers **Keep this group**, one tap for an Account, or the Account sheet first for a visitor. A GM who previews their own link by tapping a chip claims nothing.
- An Account claims at most one Player per Group. Claiming another Player in the same Group moves the claim.
- A Player claimed by another Account refuses the claim with `PLAYER_CLAIMED`. It can still be answered through the link.
- **Not you?** on a Claimed Player and **Remove from my groups** release the claim. Releasing never deletes the Player or its Answers.
- Only the GM removes a Player, and the claim goes with the row. Expiry of an Unsaved Group deletes its Players the same way.

An Anonymous GM cannot claim. Its session can end with its last Group, and a claim would vanish with it. **Keep this group** from an Anonymous GM's browser runs Save first (ADR-0003), then claims.

## Considered Options

- **A separate Player account type**: two sign-in paths and two `users` shapes for the same person, who often runs one table and plays at another.
- **Claimed Players answer only through their Account**: real protection, but a Player who is signed out on their phone could no longer answer through the one link. That breaks the one-link product ADR-0004 protects, and it needs a GM override for wrong claims.
- **Claim every picked chip automatically while signed in**: fewer taps, but a GM previewing their own link would claim their Players' names.
- **Anonymous Players with server sessions** (Lonir before ADR-0077): cost without protection, and no cross-device list.

## Consequences

- ADR-0002's "Players never get accounts" no longer holds; the no-account player path is unchanged. ADR-0004 stands for answering; Player identity now lives on the device, or on the Account for a Claimed Player, and the server's claim wins over `localStorage`.
- Rotating the Share Token stops the old link, but Claimed Players keep reaching the Group through My groups, which returns the current token. The GM's remedy for an unwanted Claimed Player is removing that Player.
- Anyone with the link can claim an unclaimed name first. The real person then sees `PLAYER_CLAIMED`, and the GM removes the squatter. This is the same trust ADR-0004 already places in link holders.
- Claims give the later email notifications their recipients: the Accounts behind a Group's Claimed Players.
