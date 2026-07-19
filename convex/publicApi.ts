import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

// Internal functions backing the public REST API (convex/http.ts /api/v1/*).
// The HTTP layer authenticates the caller via their API key (hk_...), resolves
// the key's Space, and calls these with that spaceId/companyId. No user identity
// is involved, so these are internal-only (never client-callable).
//
// Rate limiting (feature 20): a fixed-window counter per API key per minute,
// stored in `apiUsage` (bucket "min:<epochMin>"). O(1) read + patch-in-place,
// same shape as the guard-layer counters elsewhere in the codebase. The daily
// bucket ("day:<YYYY-MM-DD>") is a separate row used for usage reporting.

const DEFAULT_RATE_LIMIT_PER_MIN = 60;

function minuteBucket(d = Date.now()): string {
  return `min:${Math.floor(d / 60_000)}`;
}
function dayBucket(d = Date.now()): string {
  return `day:${new Date(d).toISOString().slice(0, 10)}`;
}

export const touchKey = internalMutation({
  args: { keyId: v.id("apiKeys") },
  handler: async (ctx, { keyId }) => {
    await ctx.db.patch(keyId, { lastUsedAt: Date.now() });
  },
});

/**
 * Check + record one request against the caller's per-minute rate limit and
 * the daily usage counter. Returns `{ allowed: false }` (never throws) so the
 * HTTP layer can respond with a clean 429 envelope. Call once per request,
 * right after auth, before doing any real work.
 */
export const recordRequest = internalMutation({
  args: {
    apiKeyId: v.id("apiKeys"),
    companyId: v.string(),
    spaceId: v.id("spaces"),
    route: v.string(),
    limitPerMinute: v.optional(v.number()),
    isError: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { apiKeyId, companyId, spaceId, route, limitPerMinute, isError },
  ): Promise<{ allowed: boolean; limit: number; remaining: number }> => {
    const now = Date.now();
    const limit = limitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MIN;
    const minBucket = minuteBucket(now);

    const minRow = await ctx.db
      .query("apiUsage")
      .withIndex("by_key_bucket", (q) => q.eq("apiKeyId", apiKeyId).eq("bucket", minBucket))
      .unique();
    const currentCount = minRow?.count ?? 0;
    const allowed = currentCount < limit;

    if (allowed) {
      if (minRow) {
        await ctx.db.patch(minRow._id, {
          count: minRow.count + 1,
          errorCount: (minRow.errorCount ?? 0) + (isError ? 1 : 0),
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("apiUsage", {
          companyId,
          spaceId,
          apiKeyId,
          bucket: minBucket,
          count: 1,
          errorCount: isError ? 1 : 0,
          updatedAt: now,
        });
      }

      const dayBkt = dayBucket(now);
      const dayRow = await ctx.db
        .query("apiUsage")
        .withIndex("by_key_bucket", (q) => q.eq("apiKeyId", apiKeyId).eq("bucket", dayBkt))
        .unique();
      if (dayRow) {
        const routes = { ...(dayRow.routes ?? {}) };
        routes[route] = (routes[route] ?? 0) + 1;
        await ctx.db.patch(dayRow._id, {
          count: dayRow.count + 1,
          errorCount: (dayRow.errorCount ?? 0) + (isError ? 1 : 0),
          routes,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("apiUsage", {
          companyId,
          spaceId,
          apiKeyId,
          bucket: dayBkt,
          count: 1,
          errorCount: isError ? 1 : 0,
          routes: { [route]: 1 },
          updatedAt: now,
        });
      }
    }

    return { allowed, limit, remaining: Math.max(0, limit - currentCount - (allowed ? 1 : 0)) };
  },
});

/** Usage summary for the calling key: today's totals + a small route breakdown. */
export const usageSummary = internalQuery({
  args: { apiKeyId: v.id("apiKeys") },
  handler: async (ctx, { apiKeyId }) => {
    const dayBkt = dayBucket();
    const minBkt = minuteBucket();
    const [dayRow, minRow] = await Promise.all([
      ctx.db
        .query("apiUsage")
        .withIndex("by_key_bucket", (q) => q.eq("apiKeyId", apiKeyId).eq("bucket", dayBkt))
        .unique(),
      ctx.db
        .query("apiUsage")
        .withIndex("by_key_bucket", (q) => q.eq("apiKeyId", apiKeyId).eq("bucket", minBkt))
        .unique(),
    ]);
    return {
      today: {
        requests: dayRow?.count ?? 0,
        errors: dayRow?.errorCount ?? 0,
        routes: dayRow?.routes ?? {},
      },
      currentMinute: { requests: minRow?.count ?? 0 },
    };
  },
});

export const listAgents = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const rows = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return rows.map((a) => ({
      id: a._id,
      name: a.name,
      status: a.status,
      kind: a.kind ?? "hermes",
      framework: a.framework,
      capabilities: a.capabilities ?? [],
      deploymentStatus: a.deploymentStatus,
    }));
  },
});

/** Deployed fleet agents (those provisioned onto a VM) — public "deploys" surface. */
export const listDeploys = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const rows = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return rows
      .filter((a) => !!a.vmId || !!a.deploymentStatus)
      .map((a) => ({
        id: a._id,
        name: a.name,
        vmProvider: a.vmProvider,
        vmId: a.vmId,
        region: a.region,
        deploymentStatus: a.deploymentStatus,
        harness: a.harness,
        status: a.status,
      }));
  },
});

export const listTasks = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return rows.map((t) => ({
      id: t._id,
      title: t.title,
      status: t.status,
      priority: t.priority,
    }));
  },
});

export const createTask = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    companyId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { spaceId, companyId, title, description }) => {
    const now = Date.now();
    return await ctx.db.insert("tasks", {
      companyId,
      spaceId,
      title,
      description,
      status: "todo",
      priority: "medium",
      orderKey: String(Number.MAX_SAFE_INTEGER - now).padStart(20, "0"),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const sendMessage = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    companyId: v.string(),
    content: v.string(),
    threadTitle: v.optional(v.string()),
  },
  handler: async (ctx, { spaceId, companyId, content, threadTitle }) => {
    const now = Date.now();
    const threadId = await ctx.db.insert("threads", {
      companyId,
      spaceId,
      title: threadTitle ?? "API message",
      status: "active",
      messageCount: 1,
      createdAt: now,
      lastMessageAt: now,
    });
    await ctx.db.insert("messages", {
      companyId,
      spaceId,
      threadId,
      role: "user",
      content,
      createdAt: now,
    });
    return { threadId };
  },
});

export const listWorkflows = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const rows = await ctx.db
      .query("workflows")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return rows.map((w) => ({
      id: w._id,
      name: w.name,
      enabled: w.enabled,
      stepCount: w.steps.length,
      updatedAt: w.updatedAt,
    }));
  },
});

export const listWorkflowRuns = internalQuery({
  args: { spaceId: v.id("spaces"), workflowId: v.optional(v.id("workflows")) },
  handler: async (ctx, { spaceId, workflowId }) => {
    let rows = await ctx.db
      .query("workflowRuns")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(100);
    if (workflowId) rows = rows.filter((r) => r.workflowId === workflowId);
    return rows.map((r) => ({
      id: r._id,
      workflowId: r.workflowId,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    }));
  },
});
