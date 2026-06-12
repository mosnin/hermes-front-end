import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";

const ROLE = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("system"),
  v.literal("tool"),
);

/** Post a message from the dashboard into a thread. */
export const send = mutation({
  args: {
    spaceId: v.id("spaces"),
    threadId: v.id("threads"),
    role: ROLE,
    content: v.string(),
  },
  handler: async (ctx, { spaceId, threadId, role, content }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.spaceId !== spaceId) throw new Error("Not found");
    const id = await ctx.db.insert("messages", {
      companyId: scope.companyId,
      spaceId,
      threadId,
      agentId: thread.agentId,
      role,
      content,
      createdAt: Date.now(),
    });
    await ctx.db.patch(threadId, {
      lastMessageAt: Date.now(),
      messageCount: (thread.messageCount ?? 0) + 1,
    });
    return id;
  },
});

/** Append a message relayed by the connector. Token-authenticated path. */
export const appendFromConnector = internalMutation({
  args: {
    companyId: v.string(),
    spaceId: v.id("spaces"),
    threadId: v.id("threads"),
    agentId: v.id("agents"),
    role: ROLE,
    content: v.string(),
    toolCalls: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("messages", {
      ...args,
      createdAt: Date.now(),
    });
    const thread = await ctx.db.get(args.threadId);
    if (thread) {
      await ctx.db.patch(args.threadId, {
        lastMessageAt: Date.now(),
        messageCount: (thread.messageCount ?? 0) + 1,
      });
    }
    return id;
  },
});
