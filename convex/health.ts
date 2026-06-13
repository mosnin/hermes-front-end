import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveScope } from "./lib/auth";
import { recordNotification } from "./lib/events";

const DEGRADE_MS = 90_000; // missed heartbeats -> degraded
const OFFLINE_MS = 300_000; // prolonged silence -> offline

/**
 * Cron: mark agents degraded/offline by heartbeat staleness and alert.
 * Paginated + self-chaining so it scales past a single page of agents.
 */
export const sweep = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const now = Date.now();
    const page = await ctx.db
      .query("agents")
      .paginate({ numItems: 200, cursor: cursor ?? null });
    for (const a of page.page) {
      if (a.kind === "a2a-external") continue;
      const last = a.lastHeartbeat ?? 0;
      const age = now - last;
      let next: typeof a.status | null = null;
      if ((a.status === "online" || a.status === "degraded") && age > OFFLINE_MS) {
        next = "offline";
      } else if (a.status === "online" && age > DEGRADE_MS) {
        next = "degraded";
      }
      if (next && next !== a.status) {
        await ctx.db.patch(a._id, { status: next });
        await ctx.db.insert("activity", {
          companyId: a.companyId,
          spaceId: a.spaceId,
          agentId: a._id,
          type: "alert",
          title: `${a.name} is ${next}`,
          detail: `No heartbeat for ${Math.round(age / 1000)}s`,
          createdAt: now,
        });
        await ctx.db.insert("workEvents", {
          companyId: a.companyId,
          spaceId: a.spaceId,
          actorType: "system",
          agentId: a._id,
          category: "governance",
          action: "agent_health",
          summary: `${a.name} -> ${next} (stale heartbeat)`,
          createdAt: now,
        });
        await recordNotification(ctx, {
          companyId: a.companyId,
          spaceId: a.spaceId,
          type: "alert",
          title: `${a.name} is ${next}`,
          body: `No heartbeat for ${Math.round(age / 1000)}s`,
          href: "/dashboard/ops",
        });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.health.sweep, {
        cursor: page.continueCursor,
      });
    }
  },
});

/** Recent health/governance alerts for a Space (for the ops page). */
export const alerts = query({
  args: { spaceId: v.id("spaces"), limit: v.optional(v.number()) },
  handler: async (ctx, { spaceId, limit }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("activity")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(300);
    return rows.filter((r) => r.type === "alert").slice(0, limit ?? 50);
  },
});
