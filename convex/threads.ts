import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getOwnerId } from "./lib/auth";

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    const ownerId = await getOwnerId(ctx);
    const rows = await ctx.db
      .query("threads")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
    return status ? rows.filter((t) => t.status === status) : rows;
  },
});

export const get = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const ownerId = await getOwnerId(ctx);
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.ownerId !== ownerId) return null;
    return thread;
  },
});

export const messages = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const ownerId = await getOwnerId(ctx);
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.ownerId !== ownerId) return [];
    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("asc")
      .collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, { title, agentId }) => {
    const ownerId = await getOwnerId(ctx);
    return await ctx.db.insert("threads", {
      ownerId,
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
    threadId: v.id("threads"),
    status: v.union(
      v.literal("active"),
      v.literal("idle"),
      v.literal("archived"),
    ),
  },
  handler: async (ctx, { threadId, status }) => {
    const ownerId = await getOwnerId(ctx);
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.ownerId !== ownerId) throw new Error("Not found");
    await ctx.db.patch(threadId, { status });
  },
});

// --- connector ingestion ----------------------------------------------------

/**
 * Upsert a thread by the connector's stable key for an agent, creating it on
 * first sight. Returns the thread id so messages/activity can attach to it.
 */
export const upsertFromConnector = internalMutation({
  args: {
    ownerId: v.string(),
    agentId: v.id("agents"),
    connectorKey: v.string(),
    title: v.string(),
  },
  handler: async (ctx, { ownerId, agentId, connectorKey, title }) => {
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
      ownerId,
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
