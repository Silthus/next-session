# Proof for #94: Lonir look, take two

Branch `ticket/94-lonir-look`. Lonir was rendered from a scratch copy of `Omni-GM/lonir` (`pnpm install`, `packages/ui` Storybook on port 6006), never from the read-only clone.

- `screenshots/side-by-side/<surface>--<width>--<theme>.png`: Lonir, ours before, ours after.
- `screenshots/lonir/`: the Lonir stories (Next Session landing, entry error, tutorial dialog, schedule page and dashboard, player calendar, Button, Input, Dialog, the brand mark, Fraunces).
- `screenshots/before/`, `screenshots/after/`: ours at 390 and 1440 px, light and dark, the same seeded Group.
- `screenshots/favicon/`: the favicon in a headed Chromium tab strip, light and dark.
- `logs/`: red runs, `bun run check`, `bun run e2e`.
- `tools/`: the capture scripts.

Lonir's surfaces are Storybook stories, so their data and layout differ from ours. Compare the feel: type, radii, buttons, borders.
