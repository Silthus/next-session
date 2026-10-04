import { useEffect, useState } from "react";
import { todayUtc, type IsoDate } from "../../../../shared/dates";

const DAY_MS = 86_400_000;

export function useToday(): IsoDate {
  const [today, setToday] = useState(() => todayUtc(Date.now()));

  useEffect(() => {
    const refresh = () => setToday(todayUtc(Date.now()));
    let midnight: ReturnType<typeof setTimeout>;
    const armMidnight = () => {
      midnight = setTimeout(() => {
        refresh();
        armMidnight();
      }, untilNextUtcDay(Date.now()));
    };
    armMidnight();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(midnight);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return today;
}

function untilNextUtcDay(now: number): number {
  return DAY_MS - (now % DAY_MS);
}
