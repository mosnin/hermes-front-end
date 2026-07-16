import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

// Internal functions backing the public REST API (convex/http.ts /api/v1/*).
// The HTTP layer authenticates the caller via their API key (hk_...), resolves
// the key's Space, and calls these with that spaceId/companyId. No user identity
// is involved, so these are internal-only (never client-callable).

export const touchKey = internalMutation({
  args: { keyId: v.id("apiKeys") },
  handler: async (ctx, { keyId }) => {
    await ctx.db.patch(keyId, { lastUsedAt: Date.now() });
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
      capabilities: a.capabilities ?? [],
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
