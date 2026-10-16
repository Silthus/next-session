// PROTOTYPE for #128, throwaway. The page states every variant renders.
import type { Autocomplete } from "./AddressField";
import { emptyNight, filledNight, type UsualNight } from "./fixtures";

export const pageStates = ["empty", "typing", "freetext", "off", "filled"] as const;
export type PageState = (typeof pageStates)[number];

export type StateSetup = {
  night: UsualNight;
  autocomplete: Autocomplete;
  locationOpen: boolean;
};

export function setupFor(state: PageState): StateSetup {
  switch (state) {
    case "empty":
      return { night: emptyNight, autocomplete: "live", locationOpen: false };
    case "typing":
      return {
        night: { ...filledNight, location: "alexanderpl" },
        autocomplete: "live",
        locationOpen: true,
      };
    case "freetext":
      return {
        night: { ...filledNight, location: "Max's place" },
        autocomplete: "live",
        locationOpen: true,
      };
    case "off":
      return { night: { ...filledNight, location: "Max's place" }, autocomplete: "off", locationOpen: false };
    case "filled":
      return { night: filledNight, autocomplete: "live", locationOpen: false };
  }
}

export const stateTitles: Record<PageState, string> = {
  empty: "First visit, nothing set",
  typing: "Typing an address",
  freetext: "Free text, no match",
  off: "Autocomplete off",
  filled: "Everything set",
};
