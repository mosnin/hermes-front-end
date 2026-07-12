import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { resolveScope } from "./lib/auth";
import { recordError } from "./lib/observability";

/**
 * Capture an error in its own transaction. Called from httpAction/action catch
 * blocks — a boundary that does NOT roll back — because a mutation that throws
 * would roll back an in-transaction error write along with everything else.
 */
export const capture = internalMutation({
  args: {
    companyId: v.string(),
    spaceId: v.optional(v.id("spaces")),
    traceId: v.optional(v.string()),
    source: v.string(),
    agentId: v.optional(v.id("agents")),
    kind: v.string(),
    message: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await recordError(ctx, args);
  },
});

/** Recent structured errors for a Space (newest first) — the Ops error stream. */
export const listErrors = query({
  args: { spaceId: v.id("spaces"), limit: v.optional(v.number()) },
  handler: async (ctx, { spaceId, limit }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("errors")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(Math.min(limit ?? 50, 200));
  },
});

/** Count of errors in the last 24h (for an Ops health badge). */
export const recentErrorCount = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const rows = await ctx.db
      .query("errors")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", since),
      )
      .take(101);
    return rows.length > 100 ? "100+" : String(rows.length);
  },
});

/** Correlate all events sharing a trace id across sources. */
export const byTrace = query({
  args: { spaceId: v.id("spaces"), traceId: v.string() },
  handler: async (ctx, { spaceId, traceId }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("errors")
      .withIndex("by_trace", (q) => q.eq("traceId", traceId))
      .collect();
    return rows.filter((r) => r.spaceId === spaceId);
  },
});
