import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Fire due schedule triggers once a minute. The tick is cheap and idempotent.
crons.interval("trigger tick", { minutes: 1 }, internal.triggers.tick, {});

// Generate a daily digest per Space at 00:05 UTC.
crons.daily(
  "daily digests",
  { hourUTC: 0, minuteUTC: 5 },
  internal.reports.generateAllDaily,
  {},
);

export default crons;
