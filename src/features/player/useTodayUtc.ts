import { useEffect, useState } from "react";
import { todayUtc, type IsoDate } from "../../../shared/dates";

const RECHECK_MS = 60_000;

export function useTodayUtc(): IsoDate {
  const [today, setToday] = useState(() => todayUtc(Date.now()));

  useEffect(() => {
    const refresh = () => setToday(todayUtc(Date.now()));
    const timer = setInterval(refresh, RECHECK_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return today;
}
