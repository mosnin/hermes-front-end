import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveScope } from "./lib/auth";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Per-tenant operational metrics + SLO summary for the Ops page. Every read is
 * index-bounded (.take caps) so the query stays cheap no matter how much
 * history a Space accumulates — a metrics endpoint that melts under load is
 * worse than none.
 */
export const summary = query({
  args: { spaceId: v.id("spaces"), windowHours: v.optional(v.number()) },
  handler: async (ctx, { spaceId, windowHours }) => {
    await resolveScope(ctx, spaceId);
    const windowMs = Math.min(windowHours ?? 24, 24 * 7) * 60 * 60 * 1000;
    const since = Date.now() - windowMs;

    // --- workflow runs: success rate over recent runs in the window ---------
    const recentRuns = await ctx.db
      .query("workflowRuns")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(200);
    const runsInWindow = recentRuns.filter((r) => r.startedAt >= since);
    const completed = runsInWindow.filter((r) => r.status === "completed").length;
    const failed = runsInWindow.filter((r) => r.status === "failed").length;
    const running = runsInWindow.filter((r) => r.status === "running").length;
    const finished = completed + failed;
    const successRate = finished ? completed / finished : null;

    // Run duration p50/p95 over finished runs (sorted ascending).
    const durations = runsInWindow
      .filter((r) => r.finishedAt)
      .map((r) => (r.finishedAt ?? 0) - r.startedAt)
      .sort((a, b) => a - b);
    const pct = (p: number) =>
      durations.length
        ? durations[Math.min(durations.length - 1, Math.floor(p * durations.length))]
        : null;

    // --- A2A delivery health -------------------------------------------------
    const recentMsgs = await ctx.db
      .query("a2aMessages")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", since),
      )
      .take(1000);
    const acked = recentMsgs.filter((m) => m.status === "acked").length;
    const expiredMsgs = recentMsgs.filter((m) => m.status === "expired").length;
    const redelivered = recentMsgs.filter((m) => (m.redeliveries ?? 0) > 0).length;

    // --- errors + dead letters ----------------------------------------------
    const errors = await ctx.db
      .query("errors")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", since),
      )
      .take(1000);
    const openDeadLetters = await ctx.db
      .query("deadLetters")
      .withIndex("by_space_status", (q) =>
        q.eq("spaceId", spaceId).eq("status", "open"),
      )
      .take(100);

    // --- fleet ---------------------------------------------------------------
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .take(1000);
    const online = agents.filter((a) => a.status === "online").length;

    // --- spend (from the O(1) monthly counter, mirrored in usage) ------------
    const usageRows = await ctx.db
      .query("usage")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", since),
      )
      .take(2000);
    const windowSpendUsd = usageRows.reduce((s, u) => s + (u.costUsd ?? 0), 0);

    // --- SLO verdicts ---------------------------------------------------------
    // Simple, honest thresholds; the point is a red/green a human can act on.
    const slo = {
      runSuccess: {
        target: 0.95,
        actual: successRate,
        ok: successRate === null || successRate >= 0.95,
      },
      messageLoss: {
        target: 0,
        actual: expiredMsgs,
        ok: expiredMsgs === 0,
      },
      errorBudget: {
        target: 50,
        actual: errors.length,
        ok: errors.length <= 50,
      },
      fleetOnline: {
        target: 1,
        actual: agents.length ? online / agents.length : null,
        ok: agents.length === 0 || online > 0,
      },
    };

    return {
      windowMs,
      runs: {
        started: runsInWindow.length,
        completed,
        failed,
        running,
        successRate,
        durationP50Ms: pct(0.5),
        durationP95Ms: pct(0.95),
      },
      a2a: {
        sent: recentMsgs.length,
        acked,
        redelivered,
        expired: expiredMsgs,
      },
      errors: { count: errors.length },
      deadLetters: { open: openDeadLetters.length },
      fleet: { total: agents.length, online },
      spend: { windowUsd: Math.round(windowSpendUsd * 10000) / 10000 },
      slo,
      healthy: Object.values(slo).every((s) => s.ok),
    };
  },
});
