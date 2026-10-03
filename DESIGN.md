# Next Session design direction

Status: direction set, self-accepted against the map Destination on 2026-10-02. Resolves [#6](https://github.com/Silthus/next-session/issues/6).
Prototype (on branch `prototype/ui-direction`, `git checkout prototype/ui-direction`): [`prototype/`](https://github.com/Silthus/next-session/tree/prototype/ui-direction/prototype/README.md) (`cd prototype && bun install && bun dev`). Screenshots: [`prototype/screenshots/`](https://github.com/Silthus/next-session/tree/prototype/ui-direction/prototype/screenshots/).

> On `main`: [docs/spec.md](docs/spec.md) §6.3 settles §6's open points below and overrides this file where they differ. Fonts are self-hosted, not loaded from Google Fonts; the save sheet asks for email and password in v1.

## The direction in one paragraph

Next Session is **the calendar that answers itself**. Every screen is built around one month grid, and the grid carries the whole product: the GM reads a heat-map where each day shows one tiny bar per player, the player taps big colored tiles. There is one brand accent (violet) for actions and scheduled sessions, and three fixed answer colors (green free, amber maybe, rose busy) that mean the same thing on every surface. Copy is short and warm. Nothing asks for an account until the group is worth keeping. Dark mode is a first-class peer, not an inversion, because game nights happen at night.

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
- Wordmark: "Next Session" set in Bricolage Grotesque Bold, tight tracking, next to the mark.
- Mark: a rounded day tile (the calendar cell) with a darker header band and one bright dot inside, "the one night that works". It is one shape, reads at 16 px as a favicon, and recolors with the theme (violet tile, paper dot). `prototype/src/ui.tsx` → `Logo`.

Alternatives considered: a chevron-in-a-tile ("next") read as a media player button; a three-tile stack lost legibility at favicon size.

## 2. Tokens

Tokens are CSS custom properties switched by a `.dark` class on `<html>`; Tailwind v4 maps them through `@theme inline` so classes like `bg-paper`, `text-ink-2`, `bg-free-soft` exist in both themes. Source of truth: [`prototype/src/index.css`](https://github.com/Silthus/next-session/tree/prototype/ui-direction/prototype/src/index.css).

### Color

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `paper` | `#FBFAF7` | `#0F0E13` | page background (warm off-white, near-black violet) |
| `surface` | `#FFFFFF` | `#17161D` | cards, calendar cells |
| `surface-2` | `#F3F1EC` | `#1F1E27` | sunken areas, segmented controls, skeletons |
| `line` / `line-strong` | `#E6E2D9` / `#CFC9BD` | `#2B2A35` / `#3B3947` | borders, unanswered bars |
| `ink` / `ink-2` / `ink-3` | `#17161A` / `#5B5862` / `#716D7A` | `#F4F2F7` / `#B3AFBD` / `#8A8695` | text: primary, secondary, muted |
| `accent` / `accent-strong` | `#6D5DF6` / `#5646E6` | `#8B7DFF` / `#A398FF` | primary actions, scheduled session, today |
| `accent-ink` | `#FFFFFF` | `#0F0E13` | text on accent |
| `accent-soft` | `#ECE9FE` | `#2A2650` | share-link card, soft buttons, scheduled cell fill |
| `free` / `free-soft` | `#1FA96B` / `#DDF5E8` | `#3DD68C` / `#113826` | answer: free |
| `maybe` / `maybe-soft` | `#E5A11A` / `#FCF0D2` | `#F2B544` / `#3A2E10` | answer: maybe, the nudge banner |
| `busy` / `busy-soft` | `#E4466A` / `#FCE1E8` | `#FF6B8B` / `#3F1724` | answer: busy, destructive |

Rules:

- The three answer colors are never used for anything else, and nothing else uses green, amber or rose. Violet is the only other hue.
- One exception: the WhatsApp and Telegram share icons in `ShareLinkCard` keep their brand colors (`#25D366` green, `#2AABEE` blue) so people recognize them. The brand colors appear nowhere else.
- Answer tiles always carry a glyph (✓ ? ✕) in addition to color, for color-blind players.
- Heat-map intensity on the GM grid is `color-mix(in oklab, var(--free) <0–55>%, var(--surface))` driven by the share of players who are free; a day where everyone is free is solid `free` with white text; a day with any busy answer gets no tint (the busy bar or ✕ count carries the conflict). No day is ever painted red.
- Contrast: `ink` on `paper` ≥ 14:1 both themes; `ink-3` on `surface` ≥ 4.5:1; white on `free`/`busy` ≥ 3:1 at ≥ 14 px bold (large-text rule), the glyph adds redundancy.

### Type

| Token | Face | Use |
| --- | --- | --- |
| `font-display` | Bricolage Grotesque 700/800, optical size 96, tracking −0.02em | headlines, month names, group names, big numbers |
| `font-sans` | Inter 400–700 | everything else |
| `font-mono` | JetBrains Mono 500 | the share URL, eyebrows (11 px, uppercase, +0.18em), counts like `12/30` |

Scale (rem): 0.6875 (eyebrow, cell counts), 0.75, 0.875 (body on cards), 1 (body), 1.125, 1.25, 1.5 (month), 2.25 (page h1), 3–4.5 (landing hero, fluid). Line height 1.5 for body, 1.0–1.1 for display.

Fonts are loaded from Google Fonts with `display=swap`; the system stack is the fallback, so a blocked font never blocks the page.

### Spacing, radius, elevation

- Spacing: Tailwind's 4 px scale. Page gutters 16 px (mobile) / 24 px (desktop). Card padding 16 px, calendar card 12/20 px. Grid gaps 4–8 px between cells.
- Radius: `sm` 8 (inputs, small buttons, cells on mobile), `md` 12 (buttons, cells, menus), `lg` 16 (cards), `xl` 24 (hero cards, sheets), full (avatars, pills, share icons).
- Elevation: one shadow token (`shadow-card`), soft and warm in light, deeper in dark. Borders do the structural work; shadow only lifts cards and the primary button.
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
| `Button` | the one button | `primary` (accent), `secondary` (outlined), `ghost`, `soft` (accent-soft), `free` (green, for "done" progressions), `danger` (busy-soft); sizes sm 32 / md 40 / lg 56; `disabled`, in-flight label swap ("Making your link…") |
| `Card` | surface + line + shadow-card, radius lg | `accent` border for the active day panel |
| `Eyebrow` | mono uppercase section label | — |
| `Avatar` | two-letter initials (`playerInitials`), hue derived from the name so it is stable across surfaces | xs 20 / sm 28 / md 36 |
| `Dot` | 8 px answer dot | yes / maybe / no / null |
| `ShareLinkCard` | accent-soft card: eyebrow, mono URL, Copy (turns green "Copied" for 1.6 s), WhatsApp / Telegram / Mail / native share, hint line, optional Rotate | `compact` (mobile header version, no share row) |
| `GroupSwitcher` | group name as a menu button: lists all groups with player counts, New group, Rename (inline input), Delete (two-step confirm inside the menu) | renaming, confirming delete |
| `HeatCalendar` | GM month grid; `DayCell` shows day number, today dot, per-player `MiniBars` (≤ 8 players) or `n/N ✕k` counts (> 8), star for scheduled, tint by free share; month nav; legend adapts to density | past day (40 % opacity, disabled), selected (ink ring), scheduled, perfect, tinted, neutral |
| `DayPanel` | per-date roster sorted free → maybe → busy → silent, headline counts, relative date, Schedule / Unschedule | past (button disabled), scheduled |
| `BestNights` | top three by `yes − 2·no + 0.5·maybe`, only days with no busy answer and positive score; rank badge, who is free as avatars; click selects the day | empty roster, no positive night |
| `Players` | roster rows: avatar, name, `answered/fillable` or ✓, hover kebab (rename / remove); inline add form | empty (explains self-join), adding |
| `Sessions` | upcoming as accent cards with relative date; history collapsed as "n played" | none scheduled |
| `Nudge` | amber banner after the first player joins: Save group / Later | dismissed (per browser) |
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

Mobile: header, `Nudge`, compact `ShareLinkCard`, `HeatCalendar`, a segmented control `Best nights | Players | Sessions`, the chosen panel. Selecting a day opens `DayPanel` as a fixed bottom sheet over the page; "Overview" closes it.

Interactions: tap a day to select (URL `?day=`), tap again to clear; Best nights and Sessions rows select their day; Schedule / Unschedule is optimistic with a toast ("Session on Fri, Oct 16. Players see it on the link.") and an Undo action; month nav is URL-backed `?month=`, forward limit current month + 2; Rotate asks for no confirm but toasts "Link rotated. Old links stopped working." with Undo for 5 s.

States:

- **empty group** (`/g/fresh`, right after create): calendar neutral, Players explains "Players add themselves when they open your link" with the add form open, Best nights "Once players answer…", Sessions "Nothing scheduled…", no nudge, header name "My group" with the switcher inviting a rename.
- **loading**: header shows a skeleton name; grid of skeletons matching the real layout; no spinner.
- **error**: one centered card "We lost the connection. Your answers are safe." with Try again; the shell stays so navigation works.
- **past month**: "Past month" pill next to the month name, all cells at 40 %, not selectable, Best nights empty, Schedule disabled.
- **many players** (> 8): cells switch from bars to `n/N` with a rose `✕k` for busy counts; legend follows; Players list scrolls inside its card after 10 rows; Best nights avatars cap at four.
- **day selected**: see above; the selected cell gets an ink ring offset from the paper.
- **anonymous vs saved**: anonymous shows `Save your group` in the header and the amber nudge once a player exists (dismiss stored per browser, re-shown after 7 days); saved shows the avatar menu instead and no nudge.
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
| D4 | **Three answer colors are fixed and exclusive** (green/amber/rose), brand accent is violet. | Brand accent as "free" color. Rejected: it muddles the action color with an answer. |
| D5 | **Glyphs on player tiles** (✓ ? ✕) in addition to color. | Color only (lonir). Rejected for color-blind players. |
| D6 | **Bricolage Grotesque + Inter + JetBrains Mono** from Google Fonts with system fallback. | System-only stack (zero network). Reversible by removing one `<link>`. |
| D7 | **Dark theme follows the OS**, with a manual toggle in the avatar menu later; no toggle in v1. | Toggle in the header. Parity says OS only. |
| D8 | **Share link lives in the GM header rail, always visible**; the GM tutorial dialog is dropped because the created moment on the landing covers it. | Keep a first-run dialog. One fewer modal. |
| D9 | **Save group is a sheet**, not a route. | A `/save` page. The sheet keeps the group in view and the merge story believable. |
| D10 | **Nudge is an amber banner, dismissible, after the first player joins**; the permanent `Save your group` button stays in the header. | Nudge only (OmniGM) or button only. Both, because the banner explains why. |
| D11 | **Day panel on mobile is a bottom sheet** over the calendar. | Swap the tab panel. The sheet keeps the tapped cell visible. |
| D12 | **Best nights hides any day with a busy answer** and shows who is free as avatars. | Pure score ranking (lonir shows days with conflicts if the score is positive). The GM wants nights that work, not nights that score. |
| D13 | **Rotate has no confirm, only an Undo toast.** | Confirm dialog. Undo is faster and safer. |
| D14 | **Group delete is a two-step confirm inside the menu** naming what is lost. | One-click delete (lonir). |
| D15 | **No marketing beyond the hero**: no features grid, no testimonials. | A longer landing. The product is one click away; the demo strip does the selling. |

Variants considered and not built: a "list-first" GM surface (Best nights as hero) and a "week strip" player surface (one week at a time). Both lost on paper to the month grid because the GM needs the whole booking window at once and the player needs to see progress toward "done".

## 6. What the spec must decide

- The legal texts: content, controller details, and whether the privacy policy needs the account-merge and 30-day deletion paragraphs this prototype assumes.
- The anonymous-group expiry (this design says "30 quiet days" in the nudge and the terms).
- The prefilled share message text for WhatsApp / Telegram / Mail.
- Whether the email-code sign-in ships in v1 (the sheet shows it; hosting research says Password first, Google next). If not, the sheet shows Google only and the field is removed.
- The first-visit player tutorial: popover (this design) or the cycling tip alone.
- Undo semantics for Rotate: the backend needs a short grace window that keeps the old token valid, or Rotate falls back to a confirm.
- Whether Best nights should cross the month boundary (this design is per visible month).
