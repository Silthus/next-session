import { useEffect, useState } from "react";
import { todayUtc, type IsoDate } from "../../../../shared/dates";

const DAY_MS = 86_400_000;

export function useToday(): IsoDate {
  const [today, setToday] = useState(() => todayUtc(Date.now()));

  useEffect(() => {
    const refresh = () => setToday(todayUtc(Date.now()));
    const midnight = setTimeout(refresh, untilNextUtcDay(Date.now()));
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(midnight);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [today]);

  return today;
}

function untilNextUtcDay(now: number): number {
  return DAY_MS - (now % DAY_MS);
}
