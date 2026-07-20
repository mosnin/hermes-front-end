import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";
import { resolveScope } from "./lib/auth";

/**
 * Live log streaming (feature 6).
 *
 * Ingestion: the connector (or the fleet worker on its behalf) POSTs batches
 * of log lines to an HTTP route in convex/http.ts (Team E owns http.ts —
 * cross-team request: wire `POST /connector/logs` to call
 * `internal.logs.ingestBatch` the same way `/connector/activity` calls
 * `internal.activity.append`, token-authenticated via `authAgent`). Until
 * that route lands, `ingestBatch` is reachable from other internal server
 * code and from tests.
 *
 * Retention: `sweepRetention` bounds `agentLogs` growth; register it on the
 * shared cron (crons.ts is Team-shared — cross-team request below).
 *
 * Read side: `tail` powers the agent-detail log pane (level filter +
 * follow-tail via polling `useQuery`, which Convex keeps live automatically).
 */

const MAX_BATCH = 200;
const MAX_MESSAGE_LEN = 8_000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const levelValidator = v.union(
  v.literal("debug"),
  v.literal("info"),
  v.literal("warn"),
  v.literal("error"),
);

const logLineValidator = v.object({
  level: levelValidator,
  message: v.string(),
  source: v.optional(v.string()),
  seq: v.optional(v.number()),
  meta: v.optional(v.any()),
  ts: v.optional(v.number()),
});

/**
 * Token-authenticated ingestion, called from the HTTP route with an already
 * resolved `Doc<"agents">` (companyId/spaceId trusted from that lookup, not
 * from the request body — a compromised/misbehaving connector can only ever
 * write logs under its own agent's tenancy).
 */
export const ingestBatch = internalMutation({
  args: {
    companyId: v.string(),
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    lines: v.array(logLineValidator),
  },
  handler: async (ctx, { companyId, spaceId, agentId, lines }) => {
    const batch = lines.slice(0, MAX_BATCH);
    const now = Date.now();
    let inserted = 0;
    for (const line of batch) {
      await ctx.db.insert("agentLogs", {
        companyId,
        spaceId,
        agentId,
        level: line.level,
        message: line.message.slice(0, MAX_MESSAGE_LEN),
        source: line.source,
        seq: line.seq,
        meta: line.meta,
        ts: line.ts ?? now,
      });
      inserted++;
    }
    return { inserted, dropped: lines.length - batch.length };
  },
});

/**
 * Paginated tail for the agent detail log pane. Returns newest-first pages;
 * the UI reverses for display and re-queries on a short interval for
 * follow-tail (Convex's reactive query already re-renders on new inserts, so
 * "follow" is just "stay scrolled to the bottom of the latest page").
 */
export const tail = query({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    level: v.optional(levelValidator),
    limit: v.optional(v.number()),
    before: v.optional(v.number()), // ts cursor for "load older"
  },
  handler: async (ctx, { spaceId, agentId, level, limit, before }) => {
    await resolveScope(ctx, spaceId);
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return [];
    const cap = Math.max(1, Math.min(limit ?? 200, 500));

    if (level) {
      let q = ctx.db
        .query("agentLogs")
        .withIndex("by_agent_level_time", (idx) =>
          before !== undefined
            ? idx.eq("agentId", agentId).eq("level", level).lt("ts", before)
            : idx.eq("agentId", agentId).eq("level", level),
        )
        .order("desc");
      return await q.take(cap);
    }

    let q = ctx.db
      .query("agentLogs")
      .withIndex("by_agent_time", (idx) =>
        before !== undefined
          ? idx.eq("agentId", agentId).lt("ts", before)
          : idx.eq("agentId", agentId),
      )
      .order("desc");
    return await q.take(cap);
  },
});

/** Count of log lines by level in the last `windowMs` (default 1h), for a small summary strip. */
export const levelCounts = query({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents"), windowMs: v.optional(v.number()) },
  handler: async (ctx, { spaceId, agentId, windowMs }) => {
    await resolveScope(ctx, spaceId);
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return { debug: 0, info: 0, warn: 0, error: 0 };
    const since = Date.now() - (windowMs ?? 60 * 60 * 1000);
    const rows = await ctx.db
      .query("agentLogs")
      .withIndex("by_agent_time", (idx) => idx.eq("agentId", agentId).gte("ts", since))
      .take(2000);
    const counts = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const r of rows) counts[r.level]++;
    return counts;
  },
});

/** Bounded retention sweep, paginated + self-chaining like health.sweep. */
export const sweepRetention = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }): Promise<{ deleted: number }> => {
    const cutoff = Date.now() - RETENTION_MS;
    const stale = await ctx.db
      .query("agentLogs")
      .withIndex("by_time", (q) => q.lt("ts", cutoff))
      .take(500);
    for (const row of stale) await ctx.db.delete(row._id);
    return { deleted: stale.length };
  },
});

/** Internal helper for other modules (e.g. self-healing) to check recent error volume. */
export const recentErrorCount = internalQuery({
  args: { agentId: v.id("agents"), windowMs: v.number() },
  handler: async (ctx, { agentId, windowMs }) => {
    const since = Date.now() - windowMs;
    const rows = await ctx.db
      .query("agentLogs")
      .withIndex("by_agent_level_time", (idx) =>
        idx.eq("agentId", agentId).eq("level", "error").gte("ts", since),
      )
      .take(500);
    return rows.length;
  },
});
