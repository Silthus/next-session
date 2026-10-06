# Proof for #22: cutover of next-session.link

- `logs/red.txt`, `logs/green.txt`: the `/privacy` effective-date test before and after `LEGAL_VERSIONS.effective = "2026-10-04"`.
- `logs/check.txt`: `bun run check` on `539edeb`, ending with `wrangler deploy --dry-run` and the custom-domain route.
- `dns/before.txt`, `dns/after.txt`, `dns/final.txt`: zone records before the attach, right after it, and after Michael deleted the redirect rule. Only the apex changed (CNAME `convex.domains` to the Worker's `AAAA 100::`).
- `cutover-anon.spec.ts`: a throwaway, anonymous-only check run with `BASE_URL=https://next-session.link`. It was not committed to `main`. It creates a link, opens the Share Link in a second context, joins as a Player, then deletes the Group.
- `screenshots/`: landing, link created, player join screen, player joined, and the GM's Group, all on next-session.link.
