import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Fire due schedule triggers once a minute. The tick is cheap and idempotent.
crons.interval("trigger tick", { minutes: 1 }, internal.triggers.tick, {});

export default crons;
