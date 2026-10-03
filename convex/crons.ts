import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "delete Unsaved Groups after their quiet days",
  { hourUTC: 3, minuteUTC: 17 },
  internal.cleanup.sweepExpiredGroups,
  {},
);

export default crons;
