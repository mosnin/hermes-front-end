import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveScope } from "./lib/auth";

/**
 * Operator infra-cost ESTIMATOR (read-only).
 *
 * The platform OPERATOR pays Convex / Vercel / Clerk; users pay their own agent
 * compute + LLM tokens (tracked separately in the `usage` table). We cannot read
 * Convex's real invoice from here, so this module ESTIMATES the operator's
 * Convex-driven cost for a Space from OBSERVABLE activity (agent counts + this
 * month's event rows) multiplied by tunable assumptions.
 *
 * Everything below is an APPROXIMATION. Treat the output as a directional model,
 * not a bill. Tune the constants to your actual Convex plan + connector loop.
 */

// === ASSUMPTIONS (edit these to match your deployment) =====================
// --- Always-on agent poll/heartbeat traffic (the dominant driver) ----------
// A connector polling on a 2s loop makes ~86,400 function calls/agent/day.
const POLL_INTERVAL_SECONDS = 2;
const SECONDS_PER_DAY = 86_400;
const POLL_CALLS_PER_AGENT_PER_DAY = Math.round(
  SECONDS_PER_DAY / POLL_INTERVAL_SECONDS,
); // ≈ 43,200 at 2s; the 86,400 figure assumes a 1s loop. Tune to your loop.
// Heartbeats roughly every 30s ⇒ ~2,880/day.
const HEARTBEATS_PER_DAY = 2_880;

// --- Writes amplification per logical event --------------------------------
// One A2A message fans out to several DB writes (message row, recipient index
// touch, work event, activity, notification, ...).
const WRITES_PER_A2A = 5;
// One workflow step does more (run step row, run patch, work event, activity,
// usage, action ledger, ...).
const WRITES_PER_STEP = 8;
// Generic events (activity / workEvents / usage rows) ≈ 1 write each already,
// but each also triggers ~1 function call to produce it.
const WRITES_PER_GENERIC_EVENT = 1;

// --- Convex unit prices (APPROXIMATE — tune to your Convex plan) -----------
// Convex meters function calls, database bandwidth, and storage. We model the
// two activity-driven dimensions with simple per-call / per-write dollar
// constants. These are intentionally rough; replace with your plan's rates.
const CONVEX_FN_CALL_USD = 2 / 1e6; // ~$2 per 1M function calls
const CONVEX_WRITE_USD = 1 / 1e6; // ~$1 per 1M document writes (bandwidth proxy)

const DAYS_PER_MONTH = 30;

/** Days elapsed so far in the current UTC month (>=1), for month-to-date math. */
function daysElapsedThisMonth(now: number, monthStart: number): number {
  return Math.max(1, (now - monthStart) / (1000 * 60 * 60 * 24));
}

/** Project poll function-calls/month for a given poll interval (seconds). */
function pollCallsPerMonth(alwaysOnAgents: number, intervalSeconds: number): number {
  const callsPerAgentPerDay = SECONDS_PER_DAY / intervalSeconds;
  return Math.round(alwaysOnAgents * callsPerAgentPerDay * DAYS_PER_MONTH);
}

/**
 * Estimate this Space's monthly operator Convex cost from observable activity.
 * Pure, read-only. Does NOT represent the real Convex bill.
 */
export const estimate = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);

    const now = Date.now();
    const d = new Date(now);
    const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const elapsedDays = daysElapsedThisMonth(now, monthStart);

    // --- Agents: how many, and how many are "always-on" (status online) ----
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const totalAgents = agents.length;
    const alwaysOnAgents = agents.filter((a) => a.status === "online").length;

    // --- This month's event rows (drive event function calls + writes) ------
    const a2a = await ctx.db
      .query("a2aMessages")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", monthStart),
      )
      .collect();

    // runSteps has no by_space_time index; it's indexed by_run. Pull this
    // month's runs for the Space, then their steps.
    const runs = await ctx.db
      .query("workflowRuns")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const runsThisMonth = runs.filter((r) => r.startedAt >= monthStart);
    let runSteps = 0;
    for (const r of runsThisMonth) {
      const steps = await ctx.db
        .query("runSteps")
        .withIndex("by_run", (q) => q.eq("workflowRunId", r._id))
        .collect();
      runSteps += steps.length;
    }

    const activity = await ctx.db
      .query("activity")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", monthStart),
      )
      .collect();

    const workEvents = await ctx.db
      .query("workEvents")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", monthStart),
      )
      .collect();

    const usageRows = await ctx.db
      .query("usage")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", monthStart),
      )
      .collect();

    const a2aCount = a2a.length;
    const activityCount = activity.length;
    const workEventCount = workEvents.length;
    const usageCount = usageRows.length;
    const genericEvents = activityCount + workEventCount + usageCount;

    // --- Poll/heartbeat calls (steady-state, projected over the month) ------
    const estPollCallsPerMonth = Math.round(
      alwaysOnAgents *
        (POLL_CALLS_PER_AGENT_PER_DAY + HEARTBEATS_PER_DAY) *
        DAYS_PER_MONTH,
    );

    // --- Event-driven calls: extrapolate month-to-date to a full month ------
    const observedEventCalls =
      a2aCount + runSteps + genericEvents; // ~1 fn call produced each row
    const monthFactor = DAYS_PER_MONTH / elapsedDays;
    const estEventCallsPerMonth = Math.round(observedEventCalls * monthFactor);

    const estTotalFnCalls = estPollCallsPerMonth + estEventCallsPerMonth;

    // --- Writes: poll/heartbeat are mostly reads; events amplify to writes --
    const observedWrites =
      a2aCount * WRITES_PER_A2A +
      runSteps * WRITES_PER_STEP +
      genericEvents * WRITES_PER_GENERIC_EVENT;
    const estWritesPerMonth = Math.round(observedWrites * monthFactor);

    // --- Cost: function calls + write bandwidth -----------------------------
    const pollCostUsd = estPollCallsPerMonth * CONVEX_FN_CALL_USD;
    const eventCallCostUsd = estEventCallsPerMonth * CONVEX_FN_CALL_USD;
    const writeCostUsd = estWritesPerMonth * CONVEX_WRITE_USD;
    const estConvexCostUsd = pollCostUsd + eventCallCostUsd + writeCostUsd;

    // --- Lever: same agents, cheaper transport ------------------------------
    const poll2s = pollCallsPerMonth(alwaysOnAgents, 2);
    const poll10s = pollCallsPerMonth(alwaysOnAgents, 10);
    const eventPush = 0; // event-push ⇒ no idle polling at all
    const heartbeatCallsPerMonth = Math.round(
      alwaysOnAgents * HEARTBEATS_PER_DAY * DAYS_PER_MONTH,
    );
    const projection = (pollCalls: number) => {
      const fnCalls = pollCalls + heartbeatCallsPerMonth + estEventCallsPerMonth;
      const costUsd =
        (pollCalls + heartbeatCallsPerMonth) * CONVEX_FN_CALL_USD +
        eventCallCostUsd +
        writeCostUsd;
      return { pollCalls, fnCalls, costUsd };
    };

    return {
      monthStart,
      elapsedDays: Math.round(elapsedDays * 10) / 10,
      totalAgents,
      alwaysOnAgents,
      estPollCallsPerMonth,
      estEventCallsPerMonth,
      estTotalFnCalls,
      estWritesPerMonth,
      estConvexCostUsd,
      byCategory: {
        poll: { fnCalls: estPollCallsPerMonth - heartbeatCallsPerMonth, costUsd: pollCostUsd - heartbeatCallsPerMonth * CONVEX_FN_CALL_USD },
        heartbeat: {
          fnCalls: heartbeatCallsPerMonth,
          costUsd: heartbeatCallsPerMonth * CONVEX_FN_CALL_USD,
        },
        events: { fnCalls: estEventCallsPerMonth, costUsd: eventCallCostUsd },
        writes: { writes: estWritesPerMonth, costUsd: writeCostUsd },
      },
      observed: {
        a2aMessages: a2aCount,
        runSteps,
        activity: activityCount,
        workEvents: workEventCount,
        usageRows: usageCount,
      },
      // The "lever": polling is the dominant idle cost. Stretch the interval or
      // switch to event-push and the projected monthly $ drops accordingly.
      lever: {
        poll2s: projection(poll2s),
        poll10s: projection(poll10s),
        eventPush: projection(eventPush),
      },
      assumptions: {
        POLL_INTERVAL_SECONDS,
        POLL_CALLS_PER_AGENT_PER_DAY,
        HEARTBEATS_PER_DAY,
        WRITES_PER_A2A,
        WRITES_PER_STEP,
        WRITES_PER_GENERIC_EVENT,
        CONVEX_FN_CALL_USD,
        CONVEX_WRITE_USD,
        DAYS_PER_MONTH,
        note: "Estimate only — NOT the real Convex bill. Tune constants in convex/costs.ts to your plan + connector loop.",
      },
    };
  },
});
