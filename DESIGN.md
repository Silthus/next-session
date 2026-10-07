# Next Session design direction

Status: direction set, self-accepted against the map Destination on 2026-10-02. Resolves [#6](https://github.com/Silthus/next-session/issues/6).
Prototype (on branch `prototype/ui-direction`, `git checkout prototype/ui-direction`): [`prototype/`](https://github.com/Silthus/next-session/tree/prototype/ui-direction/prototype/README.md) (`cd prototype && bun install && bun dev`). Screenshots: [`prototype/screenshots/`](https://github.com/Silthus/next-session/tree/prototype/ui-direction/prototype/screenshots/).

> On `main`: [docs/spec.md](docs/spec.md) §6.3 settles §6's open points below and overrides this file where they differ. Fonts are self-hosted, not loaded from Google Fonts; the save sheet asks for email and password in v1.

## The direction in one paragraph

Next Session is **the calendar that answers itself**. Every screen is built around one month grid, and the grid carries the whole product: the GM reads a heat-map where each day shows one tiny bar per player, the player taps big colored tiles. The page is warm paper with one gold brand accent for actions and scheduled sessions, and three fixed answer colors (green free, orange maybe, rose busy) that mean the same thing on every surface. Copy is short and warm. Nothing asks for an account until the group is worth keeping. Dark mode is a first-class peer, not an inversion, because game nights happen at night.

## 1. Brand

### Personality

The friend who finally gets the group together. Decisive, warm, a little playful, never corporate and never "fantasy themed": the product serves D&D tables, board-game nights and poker crews alike, so there are no dice, dragons or parchment. Delight comes from motion and feedback (a tile pops when tapped, the progress bar fills, the link "lands"), not from decoration.

Voice rules:

- Second person, present tense, short sentences. "Your link is ready. Send it to your players."
- Name the outcome, not the feature: "Best nights", not "Top days by score".
- Numbers are human: "3 of 5 free", "in 14 days", "30 quiet days".
- Never say "submit", "sign up" or "dashboard".

### Name and wordmark

- Product name: **Next Session**. Domain: `next-session.link`. The share link reads `next-session.link/s/<token>` and is itself a brand asset: short, lowercase, obviously a link.
- Wordmark: "Next Session" set in Fraunces Semibold next to the mark. `src/ui/Wordmark.tsx`.
- Mark: Lonir's ornamented gold L, the L of *link*. Michael asked for it back on 2026-10-07 ([#94](https://github.com/Silthus/next-session/issues/94)): "it kind of matched because it was a link". The L stays a fixed gold (`#c69749`) and never themes; a status screen greys it out. Only the L crosses over: Lonir's "onir" wordmark, its name and the rest of its branding stay out. The letterforms live in `src/ui/brand/paths.ts`; `Logo` draws the L with its flourish.
- Favicon and app icons: generated from the L by `bun scripts/generate-brand.ts`, never edited by hand. `public/favicon.svg` is the plain L body without the flourish, so it reads at 16 px in light and dark tabs; `favicon-32.png` is its fallback; `apple-touch-icon.png` sets the full L on cream. `scripts/generate-brand.test.ts` fails when the committed favicon drifts from the letterforms.

Alternatives considered: the first build's gold day tile with an ink dot (replaced in #94: it lost the Lonir mark players know); a chevron-in-a-tile ("next") read as a media player button; a three-tile stack lost legibility at favicon size.

## 2. Tokens

Tokens are CSS custom properties switched by `prefers-color-scheme` (D7: the theme follows the OS); Tailwind v4 maps them through `@theme inline` so classes like `bg-paper`, `text-ink-2`, `bg-free-soft` exist in both themes. Source of truth: `src/index.css`.

### Color

Gold on paper, ported from Lonir's Next Session (`packages/ui/src/styles.css` in `Omni-GM/lonir`). Michael redirected the violet build to it on 2026-10-06 ([#55](https://github.com/Silthus/next-session/issues/55)). Lonir's role names differ: its `canvas` is our `paper`, its `paper` is our `surface`, its `chrome` is our `surface-2`.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `paper` | `oklch(93% 0.035 88)` | `oklch(15% 0.022 75)` | page background (cream, warm near-black) |
| `surface` | `oklch(97% 0.022 88)` | `oklch(18% 0.028 75)` | cards, calendar cells: the lighter sheet on the page |
| `surface-2` | `oklch(95% 0.018 88)` | `oklch(21% 0.026 75)` | sunken areas, segmented controls, skeletons |
| `line` / `line-strong` | `oklch(89% 0.022 88)` / `oklch(82% 0.026 88)` | `oklch(27% 0.016 80)` / `oklch(35% 0.02 80)` | quiet borders, unanswered bars |
| `ink` / `ink-2` / `ink-3` | `oklch(20% 0.012 60)` / `oklch(40% 0.018 60)` / `oklch(50% 0.02 60)` | `oklch(96% 0.006 85)` / `oklch(76% 0.018 85)` / `oklch(62% 0.02 85)` | text: primary, secondary, muted |
| `accent` | `oklch(70% 0.12 80)` | `oklch(74% 0.12 82)` | honey gold: primary buttons, the logo, session tiles and badges. A fill, never text |
| `accent-strong` | `oklch(48% 0.13 80)` | `oklch(80% 0.11 84)` | gold that reads: links, stars, today, focus rings |
| `accent-ink` | `oklch(22% 0.02 60)` | `oklch(18% 0.02 70)` | text on accent |
| `accent-soft` | `oklch(92% 0.05 88)` | `oklch(26% 0.05 82)` | share-link card, soft buttons, scheduled cell fill |
| `free` / `free-soft` | `oklch(62.5% 0.145 157)` / `oklch(94.9% 0.031 162)` | `#3DD68C` / `#113826` | answer: free |
| `maybe` / `maybe-soft` | `oklch(76% 0.15 52)` / `oklch(94% 0.04 55)` | `oklch(82% 0.13 52)` / `oklch(27% 0.045 55)` | answer: maybe, the nudge banner |
| `maybe-bar` | `oklch(64% 0.16 52)` | `oklch(82% 0.13 52)` | every small maybe graphic on cream: the GM-grid bar and its legend, the `Dot`, the landing demo strip. The same orange, darker in light so it reads at 3:1 on the cream cell |
| `busy` / `busy-soft` | `oklch(60.5% 0.194 11)` / `oklch(93.4% 0.031 0)` | `#FF6B8B` / `#3F1724` | answer: busy, destructive |

Rules:

- The three answer colors are never used for anything else, and nothing else uses green, orange or rose. Gold is the only other hue.
- Maybe sits at hue 52, at least 25° from the gold accent (80), so a maybe tile never reads as a session.
- `accent` is a fill. Text, icons and focus indicators use `accent-strong`.
- One exception: the WhatsApp and Telegram share targets in `ShareLinkCard` show their real marks in their brand colors (`#25D366` green, `#2AABEE` blue) so people recognize them ([#94](https://github.com/Silthus/next-session/issues/94)). The marks are Simple Icons paths (CC0) inlined in `src/ui/icons/brands.tsx`, so no icon dependency. Mail is an envelope and the native share an upload arrow, both in ink on `surface`. Every target is a 44 px circle. The brand colors appear nowhere else.
- Answer tiles always carry a glyph (✓ ? ✕) in addition to color, for color-blind players.
- Heat-map intensity on the GM grid is `color-mix(in oklab, var(--free) <0–55>%, var(--surface))` driven by the share of players who are free; a day where everyone is free is solid `free` with white text; a day with any busy answer gets no tint (the busy bar or ✕ count carries the conflict). No day is ever painted red.
- Contrast, pinned by `src/theme.test.ts`: `ink` on `paper` ≥ 14:1 both themes; `ink-3` on `surface` and `paper` ≥ 4.5:1; `accent-ink` on `accent` and `accent-strong` on `surface`, `paper` and `accent-soft` ≥ 4.5:1; white on `free`/`busy` ≥ 3:1 at ≥ 14 px bold (large-text rule), the glyph adds redundancy; the answer tiles read at least as well as they did before the gold theme. Free and busy are a shade darker in light so their GM-grid bars keep their contrast on the cream `surface`. On cream, one maybe color cannot keep both its GM-grid bar at 3:1 and the ink-on-maybe tile at 8:1, so the bar has its own `maybe-bar` token: 3.26:1 on `surface` in light, 10.2:1 in dark (the same value as `maybe`), at the maybe hue. Every small maybe graphic (bar, `Dot`, landing demo) uses `maybe-bar`; only the player tile, which carries ink text, keeps `maybe`.

### Type

| Token | Face | Use |
| --- | --- | --- |
| `font-display` | Fraunces, Medium for page headlines (`text-3xl` and up), Semibold below; default tracking and automatic optical size | headlines, month names, group names, big numbers |
| `font-sans` | Geist 400–700 | everything else |
| `font-mono` | JetBrains Mono 500 | the share URL, eyebrows (11 px, uppercase, +0.18em), counts like `12/30` |

Scale (rem): 0.6875 (eyebrow, cell counts), 0.75, 0.875 (body on cards), 1 (body), 1.125, 1.25, 1.5 (month), 2.25 (page h1), 3–4.5 (landing hero, fluid). Line height 1.5 for body, 1.0–1.1 for display.

Fonts are self-hosted through Fontsource (`@fontsource-variable/fraunces`, `@fontsource-variable/geist`, `@fontsource/jetbrains-mono`) with `display=swap`; the system stack is the fallback, so a blocked font never blocks the page. These are Lonir's faces ([#94](https://github.com/Silthus/next-session/issues/94)): its Next Session sets headings in Fraunces and body text in Geist.

### Spacing, radius, elevation

- Spacing: Tailwind's 4 px scale. Page gutters 16 px (mobile) / 24 px (desktop). Card padding 16 px, calendar card 12/20 px. Grid gaps 4–8 px between cells.
- Radius: Lonir's scale ([#94](https://github.com/Silthus/next-session/issues/94)), pinned by `src/theme.test.ts`: `sm` 4 (GM calendar cells, segment tabs, legend swatches), `md` 6 (every button, inputs, menu rows, player tiles), `lg` 8, `xl` 12 (cards, popovers, sheets, banners), `2xl` 16, full (avatars, pills, share icons).
- Elevation: one shadow token (`shadow-card`): a paper sheet with a one-pixel top highlight and a soft warm drop in light, a deeper drop in dark. Borders do the structural work; shadow only lifts cards and sheets. Buttons are flat, like Lonir's.
- Layout widths: landing 64 rem, GM surface 72 rem with a `minmax(0,1fr) 22rem` split at `lg`, player surface 36 rem single column, legal 42 rem.

### Motion

- Easing `--ease-snap: cubic-bezier(0.2, 0.8, 0.2, 1)`.
- `pop` 180 ms scale 1 → 1.08 → 1 on every answer tap. `rise` 320 ms fade+8 px translate for panels, sheets, the created link. `fade` 240 ms for overlays.
- State color changes 150 ms; progress bar width 300 ms ease-out.
- Fill-rest recolors cells with a 26 ms stagger (ported behaviour) while the mutation stays a single call.
- Particles: on first answer of a day, three gold flecks travel cell → progress bar; on clearing a day, grey flecks travel back (ported from lonir). Skipped under `prefers-reduced-motion`, where all durations collapse to ~0.
- Haptics: `navigator.vibrate(8)` on a tap, `[20,10,20]` on fill-rest, where available.

## 3. Components

All presentational; data arrives through props. Prototype equivalents in [`prototype/src/ui.tsx`](https://github.com/Silthus/next-session/tree/prototype/ui-direction/prototype/src/ui.tsx) and the screens.

| Component | What it is | Variants / states |
| --- | --- | --- |
| `Button` | the one button, shaped like Lonir's: `rounded-md`, Medium weight, flat (no shadow), a 2 px `accent-strong` focus outline offset 2 px | `primary` (accent), `secondary` (outlined in `line-strong`, `surface-2` on hover), `ghost` (ink, `surface-2` on hover), `soft` (accent-soft), `free` (green, for "done" progressions), `danger` (busy-soft); sizes sm 32 / md 40 / lg 48; `disabled` at 40 % opacity, in-flight label swap ("Making your link…") |
| `Card` | surface + line + shadow-card, radius xl | `accent` border for the active day panel |
| `Eyebrow` | mono uppercase section label | — |
| `Avatar` | two-letter initials (`playerInitials`), hue derived from the name so it is stable across surfaces | xs 20 / sm 28 / md 36 |
| `Dot` | 8 px answer dot | yes / maybe / no / null |
| `ShareLinkCard` | accent-soft card: eyebrow, mono URL, Copy (turns green "Copied" for 1.6 s), WhatsApp / Telegram / Mail / native share as 44 px icon circles, hint line, optional Rotate | `compact` (mobile header version: tighter padding, share row without the hint line) |
| `GroupSwitcher` | group name as a menu button: lists all groups with player counts, New group, Rename (inline input), Delete (two-step confirm inside the menu) | renaming, confirming delete |
| `HeatCalendar` | GM month grid; `DayCell` shows day number, today dot, per-player `MiniBars` (≤ 8 players, a grey outlined bar for each Player who hasn't answered a bookable day) or `n/N ✕k ▯m` counts (> 8: free, busy in rose, not answered behind the grey outlined bar), star for scheduled, tint by free share; month nav; legend adapts to density and always explains the grey bar | past day (40 % opacity, disabled), selected (ink ring), scheduled, perfect, tinted, neutral |
| `DayPanel` | per-date roster sorted free → maybe → busy → silent, headline counts, relative date, Schedule / Unschedule | past (button disabled), scheduled |
| `BestNights` | top three by `yes − 2·no + 0.5·maybe`, only days with no busy answer and positive score; rank badge, who is free as avatars; click selects the day | empty roster, no positive night |
| `Players` | roster rows: avatar, name, `answered/fillable` or ✓, hover kebab (rename / remove); inline add form | empty (explains self-join), adding |
| `Sessions` | upcoming as accent cards with relative date; history collapsed as "n played" | none scheduled |
| `Nudge` | orange banner after the first player joins: Save group / Later | dismissed (per browser) |
| `SaveSheet` | bottom sheet (mobile) / centered dialog (desktop): Google, email code, merge reassurance | — |
| `PlayerCalendar` | tap-cycle grid of big tiles with glyphs, month nav, progress bar, fill-rest button, done card, legend, cycling tip | read-only past month, done, scheduled tile (accent ring + ★ badge) |
| `Progress` | "16 of 30 nights set · 53 %" bar, turns green at 100 % | done |
| `Join` | invited-to header, name chips, type-a-name + Join | no roster yet (field only) |
| `Toast` | ink pill at the bottom with optional action (Undo) | — |
| `Skeleton` | surface-2 pulse blocks matching the layout | — |
| `LegalFooter` | Terms · Privacy · Imprint | — |

## 4. Screens

Breakpoints: mobile ≤ 640 px, tablet 640–1024, desktop ≥ 1024 (`lg`). Every screen is one column on mobile. Only the GM surface changes structure on desktop.

### 4.1 Landing `/` and one-click create

Purpose: hold a share link after one click.

Layout: header (wordmark, quiet "Log in"), hero "Stop chasing the date.", one primary `Create your link` (56 px, full width on mobile), the legal line "No sign-up. By creating a link you agree to the Terms and Privacy Policy." directly under it, the three steps as plain text. Right (desktop) / below (mobile): a decorative one-week heat strip of a fake group with a "Thu is perfect" pill, so the visitor sees the payoff before clicking.

States:

- **idle**: as above.
- **creating**: button disabled, label "Making your link…" (~0.7 s target; the anonymous user, group, token and legal stamp are one mutation).
- **created**: see 4.2; the hero stays, the button is replaced in place.
- **returning anonymous GM** (same browser): `/` redirects to the last group; the landing is not shown.
- **error** (mutation failed): button re-enables, inline line "That didn't work. Try again." in `busy`; no modal.
- **mobile**: hero at 3rem, steps stacked, demo card last.

### 4.2 Link-created moment

In place of the button: a green check line "Your link is ready. Send it to your players.", the full `ShareLinkCard` (URL, Copy, WhatsApp / Telegram / Mail / Share with a prefilled message), then `Open your group →` with "You can name it and save it to an account there." This replaces lonir's GM tutorial dialog: the terminal step *is* the landing.

States: **copied** (button green 1.6 s), **clipboard blocked** (URL text is selectable, hint "Long-press to copy"), **native share unavailable** (the ↗ button hides). Reloading `/` in the same browser lands on the group.

### 4.3 GM group surface `/g/:groupId`

Purpose: see which night works and lock it in; keep the link one tap away.

Desktop (≥ lg): sticky header (mark, `/`, `GroupSwitcher`, right: `Save your group` for anonymous GMs, avatar menu with sign-out for signed-in). Below: `Nudge` when it applies. Then a `minmax(0,1fr) 22rem` grid: left the `HeatCalendar`; right a stack of `ShareLinkCard` → `DayPanel` (only when a day is selected, it slides in above the rest) → `BestNights` → `Sessions` → `Players`.

Mobile: header, `Nudge`, compact `ShareLinkCard`, `HeatCalendar`, a full-width soft `+ Add player` button, a segmented control `Best nights | Players | Sessions`, the chosen panel. The rail opens on Players while the Roster is empty, otherwise on Best nights. `+ Add player` stays under the calendar whatever tab is open: it switches to Players and opens the add form focused. Selecting a day opens `DayPanel` as a fixed bottom sheet over the page; "Overview" closes it.

Interactions: tap a day to select (URL `?day=`), tap again to clear; Best nights and Sessions rows select their day; Schedule / Unschedule is optimistic with a toast ("Session on Fri, Oct 16. Players see it on the link.") and an Undo action; month nav is URL-backed `?month=`, forward limit current month + 2; Rotate asks for no confirm but toasts "Link rotated. Old links stopped working." with Undo for 5 s.

States:

- **empty group** (`/g/fresh`, right after create): calendar neutral, Players explains "Players add themselves when they open your link" with the add form open, Best nights "Once players answer…", Sessions "Nothing scheduled…", no nudge, header name "My group" with the switcher inviting a rename.
- **loading**: header shows a skeleton name; grid of skeletons matching the real layout; no spinner.
- **error**: one centered card "We lost the connection. Your answers are safe." with Try again; the shell stays so navigation works.
- **past month**: "Past month" pill next to the month name, all cells at 40 %, not selectable, Best nights empty, Schedule disabled.
- **many players** (> 8): cells switch from bars to `n/N` with a rose `✕k` for busy counts and a grey outlined bar with `m` for Players who haven't answered a bookable day; legend follows; Players list scrolls inside its card after 10 rows; Best nights avatars cap at four.
- **day selected**: see above; the selected cell gets an ink ring offset from the paper.
- **anonymous vs saved**: anonymous shows `Save your group` in the header and the orange nudge once a player exists (dismiss stored per browser, re-shown after 7 days); saved shows the avatar menu instead and no nudge.
- **malformed or foreign group id**: fall back to the first group, no error boundary (parity).
- **multiple groups**: the switcher lists them with player counts; `+ New group` creates "My group" and navigates; the last visited group is remembered.
- **rename / delete**: rename is inline in the header (Enter saves, Esc cancels, trimmed, 1–60 chars); delete is a two-step confirm inside the menu that names what is lost.

### 4.4 Save group to account / sign-in

A sheet, not a page, so the GM never leaves the group. Title "Keep {group}", line "The player link stays exactly the same, your players notice nothing." Buttons: Continue with Google, or email + Send code. Footer: "Already have an account? Signing in merges this group into it. Nothing gets replaced."

States: **code sent** (email field replaced by a 6-digit code input and "Check your inbox"), **error** ("That code didn't match", field stays), **in flight** (buttons disabled), **merged** (sheet closes, toast "Saved. Open it anywhere with your account."). `Log in` on the landing opens the same sheet without the merge copy and lands on the last group. Mobile: bottom sheet; desktop: centered dialog, 28 rem.

### 4.5 Player join `/s/:token`

"You're invited to" eyebrow, group name as a display h1, one line of promise, then a card "Who are you?" with alphabetical name chips (avatar + name) and a field "Not listed? Type your name" + Join. Footer: "Planning your own game? Create your link", legal links.

States: **no roster yet** (field only, placeholder "Your name"), **returning player** (cookie skips this screen), **removed player** (cookie purged, this screen with a quiet line "Your name is no longer on the list. Pick or add one."), **blank name** (Join disabled), **duplicate name** (chip highlights, "That name exists. Tap it, or add a last initial.").

### 4.6 Player calendar `/s/:token?as=`

Header: mark, group name, "Answering as Ana · Not you?", a `?` for the non-modal tutorial. Then the progress card, the month card (large tiles with glyphs, nav), the fill-rest button, the legend, a cycling tip, "Plan your own game →", legal.

Tap cycle: unanswered → free → maybe → busy → unanswered, optimistic, `pop` + haptic + particles; a failure reverts with a toast. Swipe left/right changes month. `Mark the other N nights busy` writes `no` to every remaining future day.

States: **fresh** (0 %, progress bar accent, fill button muted), **in progress** (fill button outlined in busy), **done** (green card "All set for October ✓ — Your GM sees it already." with `Fill November →`, or "All set for now" at the forward limit), **read-only past month** ("Past · read only" pill, tiles at 45 % desaturated, no progress or fill controls), **past days in the current month** (same dimming per tile), **scheduled day** (accent ring + ★ badge, still tappable), **loading** (skeletons), **first visit** (tutorial popover anchored to the first tile, dismiss by tapping any tile), **desktop** (same single column at 36 rem; tiles grow, nothing rearranges).

### 4.7 Legal pages `/terms`, `/privacy`, `/imprint`

Single 42 rem column: wordmark, "Updated {date}" eyebrow, display h1, sections with h2 + paragraph. Content is Next-Session-specific and names Michael as controller (text itself is Surfaced). Same footer. No acceptance UI here: acceptance is the Create click; the re-acceptance gate reuses `SaveSheet`'s shell with Accept / Sign out when `minAccepted` rises.

### 4.8 Not-found share link `/s/<unknown>`

Greyed mark, "This link no longer works", "The GM may have rotated the link or deleted the group. Ask them for the current one.", `Plan your own game` with "One click, no sign-up." Also used for a deleted group. Plain 404 uses the same layout with "Nothing here".

## 5. Calls made (each reversible)

| # | Call | Alternative |
| --- | --- | --- |
| D1 | **Calendar-first GM layout**: the heat-map is the primary surface, panels are a 22 rem rail on the right, tabs on mobile. | lonir's panels-left split, or a list-first layout (Best nights as the hero, calendar secondary). Rejected: the grid is what makes the product legible at a glance. |
| D2 | **Per-player mini bars in GM cells** (≤ 8 players), counts above that. | Count chips only (lonir). Bars show *who* without a hover and make the "everyone free" day pop. |
| D3 | **Never paint a day red** on the GM grid; conflicts show as a rose bar or ✕ count on a neutral cell. | Red tint for conflict days. Rejected: red grids read as alarm. |
| D4 | **Three answer colors are fixed and exclusive** (green/orange/rose); the brand is gold on warm paper, ported from Lonir's Next Session. Michael's redirect on 2026-10-06 ([#55](https://github.com/Silthus/next-session/issues/55)) replaced the violet accent, and maybe moved from amber to orange to stay clear of the gold. | Brand accent as "free" color. Rejected: it muddles the action color with an answer. Violet accent (the first build). Replaced: it lost the Lonir look players know. |
| D5 | **Glyphs on player tiles** (✓ ? ✕) in addition to color. | Color only (lonir). Rejected for color-blind players. |
| D6 | **Fraunces + Geist + JetBrains Mono**, Lonir's faces, self-hosted through Fontsource with system fallback ([#94](https://github.com/Silthus/next-session/issues/94)). | Bricolage Grotesque + Inter (the first build; replaced because it did not feel like Lonir's Next Session). A system-only stack (zero network). |
| D7 | **Dark theme follows the OS**, with a manual toggle in the avatar menu later; no toggle in v1. | Toggle in the header. Parity says OS only. |
| D8 | **Share link lives in the GM header rail, always visible**; the GM tutorial dialog is dropped because the created moment on the landing covers it. | Keep a first-run dialog. One fewer modal. |
| D9 | **Save group is a sheet**, not a route. | A `/save` page. The sheet keeps the group in view and the merge story believable. |
| D10 | **Nudge is an orange banner, dismissible, after the first player joins**; the permanent `Save your group` button stays in the header. | Nudge only (OmniGM) or button only. Both, because the banner explains why. |
| D11 | **Day panel on mobile is a bottom sheet** over the calendar. | Swap the tab panel. The sheet keeps the tapped cell visible. |
| D12 | **Best nights hides any day with a busy answer** and shows who is free as avatars. | Pure score ranking (lonir shows days with conflicts if the score is positive). The GM wants nights that work, not nights that score. |
| D13 | **Rotate has no confirm, only an Undo toast.** | Confirm dialog. Undo is faster and safer. |
| D14 | **Group delete is a two-step confirm inside the menu** naming what is lost. | One-click delete (lonir). |
| D15 | **No marketing beyond the hero**: no features grid, no testimonials. | A longer landing. The product is one click away; the demo strip does the selling. |
| D16 | **Phone `+ Add player` is a full-width soft button between the calendar and the segmented control** ([#67](https://github.com/Silthus/next-session/issues/67)). Desktop keeps the Players card's `+ Add`, already in view in the rail. | An icon-only `+` at the end of the segmented control (less obvious, squeezes the tabs at 390 px); a floating action button (covers calendar cells and collides with the toast and the day sheet). |
| D17 | **Lonir's L is the mark, and Lonir's shapes are the shapes** ([#94](https://github.com/Silthus/next-session/issues/94)). Michael on 2026-10-07: "it still doesn't feel like it has the exact same styles as before, as buttons are rounded". The L reads as the L of *link*; only the L crosses over. Buttons are `rounded-md` (6 px), cards `rounded-xl` (12 px). | Keep the day-tile mark and the rounder 8/12/16/24 scale (the first build). Port Lonir's tokens without rendering it (the #55 pass, which missed the feel). |

Variants considered and not built: a "list-first" GM surface (Best nights as hero) and a "week strip" player surface (one week at a time). Both lost on paper to the month grid because the GM needs the whole booking window at once and the player needs to see progress toward "done".

## 6. What the spec must decide

- The legal texts: content, controller details, and whether the privacy policy needs the account-merge and 30-day deletion paragraphs this prototype assumes.
- The anonymous-group expiry (this design says "30 quiet days" in the nudge and the terms).
- The prefilled share message text for WhatsApp / Telegram / Mail.
- Whether the email-code sign-in ships in v1 (the sheet shows it; hosting research says Password first, Google next). If not, the sheet shows Google only and the field is removed.
- The first-visit player tutorial: popover (this design) or the cycling tip alone.
- Undo semantics for Rotate: the backend needs a short grace window that keeps the old token valid, or Rotate falls back to a confirm.
- Whether Best nights should cross the month boundary (this design is per visible month).
