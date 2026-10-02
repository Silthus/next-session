# Next Session UI prototype

Throwaway, clickable prototype for the design direction in [`../DESIGN.md`](../DESIGN.md). Mocked data, no backend, no persistence. Resolves [#6](https://github.com/Silthus/next-session/issues/6).

```sh
cd prototype
bun install
bun dev          # http://localhost:5190
```

A yellow PROTOTYPE bar at the bottom jumps between screens and toggles dark mode. Append `?bar=0` to hide it, `?theme=dark|light` to force a theme.

Screens and their state switches:

| Screen | URL |
| --- | --- |
| Landing | `/` |
| Link created | `/?state=created` |
| GM group | `/g/thu`, `/g/curse`, `/g/board` |
| GM, day selected | `/g/thu?day=2026-10-16` |
| GM, empty group | `/g/fresh` |
| GM, 12 players | `/g/big` |
| GM, loading / error | `/g/thu?state=loading`, `/g/thu?state=error` |
| GM, past month | `/g/thu?month=2026-09` |
| Save group sheet | `/g/thu?save=1` |
| Player join | `/s/k3Qx9Lm2` |
| Player calendar | `/s/k3Qx9Lm2?as=thu-p0` |
| Player, month done | `/s/k3Qx9Lm2?as=thu-p0&state=done` |
| Player, past month | `/s/k3Qx9Lm2?as=thu-p0&month=2026-09` |
| Not-found link | `/s/nope` |
| Legal | `/terms`, `/privacy`, `/imprint` |

Screenshots: `bun screenshot.ts` (needs the dev server running and a Playwright chromium in `~/.cache/ms-playwright`, or `CHROMIUM_PATH`). Writes `screenshots/<screen>--<mobile|desktop>--<light|dark>.png`.
