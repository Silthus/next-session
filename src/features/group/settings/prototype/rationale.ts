// PROTOTYPE for #128, throwaway. One paragraph of copy rationale per state, shown on the boards.
import type { EntryState } from "./EntryPoints";
import type { PageState } from "./states";

export const variantNotes: Record<"A" | "B" | "C", string> = {
  A: "A single 36 rem column, like the player surface: headline, one card with four fields, one Save button. The most familiar shape, and the only one where the GM decides when upcoming Sessions move, because nothing changes until Save.",
  B: "Settings rows that save as the GM goes, next to the calendar entry players will get. The preview answers “why should I fill this in?” without a line of explanation, and shows what an empty field costs (All day, No place yet).",
  C: "The usual night as one Fraunces sentence with gold words to tap, each opening the existing Sheet with one field. The warmest and shortest page, but every edit is a round trip through a sheet, and a long address wraps the sentence.",
};

export const pageNotes: Record<PageState, string> = {
  empty:
    "The headline names the outcome (“Your usual night”, “When and where you play”), never “Settings”. The empty start time says what happens if it stays empty, all day, instead of demanding a value: the GM can skip it and nothing breaks. The length defaults to 4 h, a common tabletop night, and the time zone is guessed from the GM's browser and shown as a city, with Change one tap away for groups abroad.",
  typing:
    "Suggestions start at three letters. The first row always keeps exactly what the GM typed, so a pick is never forced and Enter keeps the text. Addresses read as street over town so two Alexanderplatz rows are easy to tell apart. The Geoapify and OpenStreetMap credit sits inside the list, the only place results show, which the Free plan requires.",
  freetext:
    "“Max's place” matches nothing in any geocoder, and that is fine: the list says so in a friendly line instead of an error, and Keep is still the first row. The field's hint names the three things people put there: an address, a note, a link for online games.",
  off:
    "Without a key, or after Geoapify times out or refuses, the field is a plain text input. Nothing tells the GM that suggestions are missing, because nothing is missing for them: they type the place and save it, and the stored value is the same string either way.",
  filled:
    "Saved values read back in the same words players see. The end time is computed (“Until about 23:00”) because GMs think in “seven till eleven” while the Group stores a length. The save line names the consequence: upcoming Sessions move in players' calendars.",
};

export const entryNotes: Record<EntryState, string> = {
  menu: "The group name menu already holds Rename and Delete, so Group settings joins them as “Time and place”, the outcome rather than the word settings. A small New pill marks it until the GM opens it once. This is the permanent entry point on phone and desktop.",
  "sessions-unset":
    "The Sessions card is where a GM looks when they think about the next night, so before any time is set it carries a dashed prompt: a question, why it matters, and one soft button. It is not a modal and not a step, matching the map's no-onboarding rule, and it disappears for good once a time or a place is set.",
  "sessions-set":
    "Once set, the prompt collapses to one line, the time in mono and the place, with Edit. The upcoming Session repeats the time so the GM sees what players see. This line is the everyday way back into the page.",
  "day-unset":
    "The last moment before the first Session goes out is the Schedule button, so the day panel says what players' calendars will show right above it, all day, and links to the page. Scheduling still works in one tap; nothing blocks. The Undo window gives the GM 30 seconds to fix the time before invites go out.",
  "day-set":
    "With a time and place set, the same line confirms them before scheduling, with Change. A per-Session time override (a map decision) would hang off this line later; this prototype only links to the Group's usual night.",
};
