import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { IsoMonth } from "../../../../shared/dates";

export type LoadedMonth = {
  month: IsoMonth;
  schedule: FunctionReturnType<typeof api.schedule.month>;
};

export function useMonthSchedule(groupId: Id<"groups">, month: IsoMonth): LoadedMonth | undefined {
  const schedule = useQuery(api.schedule.month, { groupId, month });
  const [shown, setShown] = useState<LoadedMonth>();
  if (schedule !== undefined && (shown?.month !== month || shown.schedule !== schedule)) {
    setShown({ month, schedule });
  }
  return schedule === undefined ? shown : { month, schedule };
}
