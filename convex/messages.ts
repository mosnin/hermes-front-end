import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { getOwnerId } from "./lib/auth";

/** Post a message from the dashboard into a thread. */
export const send = mutation({
  args: {
    threadId: v.id("threads"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
      v.literal("tool"),
    ),
    content: v.string(),
  },
  handler: async (ctx, { threadId, role, content }) => {
    const ownerId = await getOwnerId(ctx);
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.ownerId !== ownerId) throw new Error("Not found");
    const id = await ctx.db.insert("messages", {
      ownerId,
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

/** Append a message relayed by the connector. */
export const appendFromConnector = internalMutation({
  args: {
    ownerId: v.string(),
    threadId: v.id("threads"),
    agentId: v.id("agents"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
      v.literal("tool"),
    ),
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
