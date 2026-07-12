import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Fire due schedule triggers once a minute. The tick is cheap and idempotent.
crons.interval("trigger tick", { minutes: 1 }, internal.triggers.tick, {});

// Sweep agent health (degraded/offline by stale heartbeat) every minute.
crons.interval("health sweep", { minutes: 1 }, internal.health.sweep, {});

// Advance due ongoing campaigns once a minute.
crons.interval("campaign tick", { minutes: 1 }, internal.campaigns.tick, {});

// Generate a daily digest per Space at 00:05 UTC.
crons.daily(
  "daily digests",
  { hourUTC: 0, minuteUTC: 5 },
  internal.reports.generateAllDaily,
  {},
);

// Sweep expired aggregate counters (minute/day/loop buckets) hourly so the
// counters table stays bounded regardless of message volume.
crons.interval("counter sweep", { hours: 1 }, internal.maintenance.sweepCounters, {});

export default crons;
