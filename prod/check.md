# Prod check after merge (2ff0a6d, deploy run 37501696939)

No token is set and no Accounts were created. A 390 px Chromium opened `/`, `/privacy` and an unknown `/s/<token>`:

- `/` 200 "Stop chasing the date.", `/privacy` 200 "Privacy Policy", `/s/Zz9yX8wV7uQ` 200 "This link no longer works".
- Requests to `/ingest`: none. PostHog chunks loaded: none. Console errors: none. `localStorage` keys: none.
- The deployed chunks carry the new code: `AccountSheet-*.js` (`sign_in_failed`), `ShareLinkCard-*.js` (`share_link_copied`), `me-*.js` (`remove_group_undone`), `s._shareToken-*.js` (`answers_started`), `useGm-*.js` (`ConvexServerError`).
