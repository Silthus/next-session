# Save moves Groups with a single-use claim code, and never replaces an Account's Groups

Convex Auth (0.0.96) starts a fresh session on every sign-in and does not link an anonymous user to the account it signs in to: the `createOrUpdateUser` callback gets no prior session, and signing in to an existing Password account never reaches it. So before signing in, the Anonymous GM mints a claim code (`account.startSave`, stored hashed, 10-minute TTL, kept client-side in `sessionStorage`). After the sign-in, the Account redeems it (`account.finishSave`), which moves every Group of the anonymous user to the Account, clears their Expiry, and deletes the anonymous user.

The redeem only adds Groups to the Account. It never reads the Account's own Groups for deletion. That is the bug that cost OmniGM users their groups: `handleAccountLink` deleted the account's spaces before moving the anonymous one.

## Considered Options

- Reading the anonymous session inside a Convex Auth callback: works for Password sign-up only, not for signing in to an existing account or for OAuth callbacks.
- Converting the anonymous user in place by adding a password account to it: impossible when the email already has an Account, which is exactly the merge case.

## Consequences

- A failed sign-in changes nothing: the anonymous session still owns the Group.
- A dropped connection between sign-in and redeem is recovered on the next app start from the pending code, but only in the same tab and within the claim's 10 minutes. `sessionStorage` is per tab, and the server refuses an expired claim with `CLAIM_INVALID`. Moving the code to `localStorage` with a longer TTL would widen the window; we have not needed it.
- The same flow works unchanged when Google OAuth or email codes are added.
