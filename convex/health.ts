import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { resolveScope } from "./lib/auth";

const DEGRADE_MS = 90_000; // missed heartbeats -> degraded
const OFFLINE_MS = 300_000; // prolonged silence -> offline

/** Cron: mark agents degraded/offline by heartbeat staleness and alert. */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const agents = await ctx.db.query("agents").collect();
    for (const a of agents) {
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
      }
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
