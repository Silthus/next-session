import { useEffect, useState } from "react";
import { todayUtc, type IsoDate } from "../../../shared/dates";

const DAY = 86_400_000;

export function useTodayUtc(): IsoDate {
  const [today, setToday] = useState(() => todayUtc(Date.now()));

  useEffect(() => {
    const refresh = () => setToday(todayUtc(Date.now()));
    const timer = setTimeout(refresh, DAY - (Date.now() % DAY) + 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [today]);

  return today;
}
