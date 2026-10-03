# Proof bundle for Silthus/next-session#29

- `red-playerInitials.log`: the `playerInitials` tests failing before the change in `shared/names.ts`.
- `green-playerInitials.log`: the same tests passing after.
- `red-titles-mailto.log`: the document title and `mailto:` tests failing before the route `head` tags and the email inline.
- `green-titles-mailto.log`: the same tests passing after.
- `gate-check.log`: `bun run check` on the final tree (91 tests).
- `*-light.png` / `*-dark.png`: each route with its document title captioned at the top, Playwright with `colorScheme` emulation.
- `cold-load-dark-os-before-without-meta.png`: a dark-OS cold load of `/terms` with the app's module delayed 4 s and the `color-scheme` meta stripped from the response: a white canvas.
- `cold-load-dark-os-after-with-meta.png`: the same load with the meta tag in place: a dark canvas, no flash.
