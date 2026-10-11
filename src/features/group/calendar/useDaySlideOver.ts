import { useEffect, useState } from "react";
import type { IsoDate } from "../../../../shared/dates";
import { focusDay } from "./dayFocus";

type Slide = { direction: "forward" | "back"; day: IsoDate };

export function useDaySlideOver(openDay: IsoDate | null, slides: boolean) {
  const [shownDay, setShownDay] = useState(openDay);
  const [slide, setSlide] = useState<Slide | null>(null);

  if (openDay !== shownDay) {
    setShownDay(openDay);
    setSlide(slides ? slideBetween(shownDay, openDay) : null);
  }

  useEffect(() => {
    if (slide?.direction === "back") focusDay(slide.day);
  }, [slide]);

  return slide?.direction ?? null;
}

function slideBetween(from: IsoDate | null, to: IsoDate | null): Slide | null {
  if (to !== null) return { direction: "forward", day: to };
  if (from !== null) return { direction: "back", day: from };
  return null;
}
