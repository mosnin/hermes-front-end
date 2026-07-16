import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveScope } from "./lib/auth";

/** Headline analytics for a Space: throughput, completion, runs, cost, trend. */
export const summary = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const now = Date.now();
    const weekAgo = now - 7 * 86_400_000;

    const [agents, tasks, runs, events, usage] = await Promise.all([
      ctx.db.query("agents").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).collect(),
      ctx.db.query("tasks").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).collect(),
      ctx.db.query("workflowRuns").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(200),
      ctx.db
        .query("workEvents")
        .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId).gte("createdAt", weekAgo))
        .collect(),
      ctx.db
        .query("usage")
        .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId).gte("createdAt", weekAgo))
        .collect(),
    ]);

    const tasksByStatus = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
    for (const t of tasks) tasksByStatus[t.status]++;
    const completionRate = tasks.length ? tasksByStatus.done / tasks.length : 0;

    const runsByStatus: Record<string, number> = {};
    for (const r of runs) runsByStatus[r.status] = (runsByStatus[r.status] ?? 0) + 1;

    const eventsByCategory: Record<string, number> = {};
    for (const e of events) eventsByCategory[e.category] = (eventsByCategory[e.category] ?? 0) + 1;

    // Per-day work-event counts for the last 7 days (sparkline).
    const perDay: number[] = new Array(7).fill(0);
    for (const e of events) {
      const dayIdx = Math.min(6, Math.floor((e.createdAt - weekAgo) / 86_400_000));
      if (dayIdx >= 0) perDay[dayIdx]++;
    }

    const agentBreakdown = agents.map((a) => ({
      name: a.name,
      status: a.status,
      tasks: tasks.filter((t) => t.assigneeAgentId === a._id).length,
    }));

    return {
      agents: { total: agents.length, online: agents.filter((a) => a.status === "online").length },
      tasks: { total: tasks.length, byStatus: tasksByStatus, completionRate },
      runs: { total: runs.length, byStatus: runsByStatus },
      eventsLast7d: events.length,
      eventsByCategory,
      perDay,
      costUsd: usage.reduce((s, u) => s + (u.costUsd ?? 0), 0),
      agentBreakdown,
    };
  },
});
