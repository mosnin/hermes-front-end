import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";

export const list = query({
  args: { spaceId: v.id("spaces"), status: v.optional(v.string()) },
  handler: async (ctx, { spaceId, status }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("threads")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
    return status ? rows.filter((t) => t.status === status) : rows;
  },
});

export const get = query({
  args: { spaceId: v.id("spaces"), threadId: v.id("threads") },
  handler: async (ctx, { spaceId, threadId }) => {
    await resolveScope(ctx, spaceId);
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.spaceId !== spaceId) return null;
    return thread;
  },
});

export const messages = query({
  args: { spaceId: v.id("spaces"), threadId: v.id("threads") },
  handler: async (ctx, { spaceId, threadId }) => {
    await resolveScope(ctx, spaceId);
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.spaceId !== spaceId) return [];
    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("asc")
      .collect();
  },
});

export const create = mutation({
  args: {
    spaceId: v.id("spaces"),
    title: v.string(),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, { spaceId, title, agentId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    return await ctx.db.insert("threads", {
      companyId: scope.companyId,
      spaceId,
      agentId,
      title,
      status: "active",
      messageCount: 0,
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
    });
  },
});

export const setStatus = mutation({
  args: {
    spaceId: v.id("spaces"),
    threadId: v.id("threads"),
    status: v.union(
      v.literal("active"),
      v.literal("idle"),
      v.literal("archived"),
    ),
  },
  handler: async (ctx, { spaceId, threadId, status }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(threadId, { status });
  },
});

/** Upsert a connector thread by its stable key. Token-authenticated path. */
export const upsertFromConnector = internalMutation({
  args: {
    companyId: v.string(),
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    connectorKey: v.string(),
    title: v.string(),
  },
  handler: async (ctx, { companyId, spaceId, agentId, connectorKey, title }) => {
    const existing = await ctx.db
      .query("threads")
      .withIndex("by_connector_key", (q) =>
        q.eq("agentId", agentId).eq("connectorKey", connectorKey),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { lastMessageAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("threads", {
      companyId,
      spaceId,
      agentId,
      connectorKey,
      title,
      status: "active",
      messageCount: 0,
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
    });
  },
});
