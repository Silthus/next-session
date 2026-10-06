# Anonymous-first GM: one click creates the GM, the Group, and the Legal Acceptance

"Create your link" signs in with a Convex Auth anonymous provider, and the user-creation callback inserts the first Group in the same mutation, together with the Legal Acceptance stamps. A GM holds a Share Link after one click and zero fields, which is what made OmniGM's old scheduling app smooth. The GM saves the Group to an Account (email and password in v1) later, from a header button and a nudge after the first Player joins. Players never get accounts.

This reverses the hosting research's "no Anonymous provider" call (#4), which assumed GMs sign up first. The sign-up research (#3) and DESIGN.md both build the product around the one-click start.

## Considered Options

- An auth wall first (Lonir): 3 to 6 clicks and a credential before the link exists.
- Cookie-only GMs without a user row: every function would branch on two kinds of GM.
- A separate Accept screen after sign-in (Lonir ADR-0160): one more click on the critical path. The notice sits next to the button instead, and the stamps land on a real `users` row in the same transaction.

## Consequences

- Anonymous sign-up is a public write with no credential, so it is rate limited (ADR-0007) and Unsaved Groups expire (ADR-0006).
- An Anonymous GM exists only while it owns a Group.
- The anonymous provider is our own `ConvexCredentials` provider, modelled on Convex Auth's `Anonymous`, because the stock one cannot await a rate-limit check.

## Amended

[ADR-0010](0010-accounts-claim-players-share-token-still-answers.md) (2026-10-06): Players can now create an Account and claim their Player. One Account type serves both roles. The no-account player path is unchanged.
