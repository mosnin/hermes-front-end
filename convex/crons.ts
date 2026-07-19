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

// Fail + dead-letter workflow runs wedged in "running" past the wall-clock
// ceiling (broken scheduler chain, agent that never reported).
crons.interval("stuck run sweep", { hours: 1 }, internal.engine.sweepStuckRuns, {});

// Requeue delivered-but-unacked A2A messages (at-least-once delivery); expire
// + dead-letter after too many redeliveries.
crons.interval("a2a redelivery", { minutes: 1 }, internal.a2a.redeliverUnacked, {});

// Retention: bound idempotencyKeys (7d), errors (30d), abandoned streamChunks
// (1d) so no table grows without limit.
crons.interval("retention sweep", { hours: 1 }, internal.maintenance.sweepRetention, {});

// Evaluate alert rules (error spikes, budget burn, agents offline, SLO breach)
// and page the configured channel, respecting per-rule cooldowns.
crons.interval("alert eval", { minutes: 3 }, internal.alerts.evaluateAll, {});

// Managed hosting: meter one usage row per hosted (running) agent for the
// current hour bucket. Idempotent per agent/hour; safe to run more than once.
crons.interval(
  "fleet agent-hour metering",
  { hours: 1 },
  internal.fleetMetering.runHourly,
  {},
);

// Retention: bound streamed agent logs (7d) so agentLogs stays bounded.
crons.interval("agent log retention", { hours: 1 }, internal.logs.sweepRetention, {});

// Retention: purge expired/used one-click approval tokens.
crons.interval(
  "approval token sweep",
  { hours: 1 },
  internal.approvals.sweepExpiredTokens,
  {},
);

// Cost controls: mark idle hosted agents and hibernate/stop their VMs per
// each Space's cost policy.
crons.interval(
  "idle hibernation sweep",
  { hours: 1 },
  internal.costs.sweepIdleHibernation,
  {},
);

// Cost controls: enforce space-level hard caps and per-agent spend caps
// against month-to-date spend.
crons.interval("spend cap enforcement", { hours: 1 }, internal.costs.enforceSpendCaps, {});

export default crons;
