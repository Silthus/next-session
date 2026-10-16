# PROTOTYPE: Group settings page (#128)

Throwaway, never merged. Branch `prototype/group-settings`. Fake data, no backend.

**Question:** What does the Group settings page look like (usual start time, time zone, length, location with address autocomplete and free text)? Where does the GM reach it, and how do they learn it exists before the first Session goes out?

**Shape:** three variants of the page on the throwaway route `/prototype/group-settings`, switchable with `?variant=A|B|C` and the floating bar (← →). `?board=A|B|C|entry` shows every state side by side in real 390 px frames with its copy rationale underneath.

## Run it

```sh
VITE_CONVEX_URL=https://offline.convex.cloud bunx vite --port 5188
# open http://localhost:5188/prototype/group-settings?board=B
# screenshots: bun scripts/prototype-group-settings-shots.ts
```

| URL | What |
| --- | --- |
| `?board=A`, `?board=B`, `?board=C` | one variant, five states: empty, typing, free text, autocomplete off, filled |
| `?board=entry` | the entry points: group menu, Sessions card, day panel |
| `?variant=B&state=typing` | one variant, one state, live (type in the field) |

The address suggestions are a fake Geoapify (`fixtures.ts`): try "alexander", "marien", "rue", or "Max's place".

## Screenshots

Boards (phone frames): `screenshots/board-{A,B,C,entry}-{light,dark}.png`.
Desktop at 1280 px: `screenshots/desktop-{A-typing,B-typing,C-filled,C-typing}-{light,dark}.png`.

## Variants

- **A, Plain form:** one column, one card, one Save button.
- **B, Live calendar preview:** settings rows next to the calendar entry players get; saves as you go.
- **C, One sentence:** "Tuesday Crew plays at 19:00 for 4 hours at Alexanderplatz 1." Each gold word opens a sheet.

## Recommendation 🤖

B's layout and preview, with A's single Save button. The preview is the best argument for filling the page in, and it doubles as the explanation, so no onboarding copy is needed. But every saved change moves real calendar entries and can mail every Claimed Player an update, so a change needs one deliberate Save, not autosave on every keystroke. C is charming but makes every edit a round trip through a sheet.
