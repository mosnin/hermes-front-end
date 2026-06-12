import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getOwnerId } from "./lib/auth";

const STATUS = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done"),
);
const PRIORITY = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
);

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getOwnerId(ctx);
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    // Stable board ordering: by column then orderKey.
    return rows.sort((a, b) => a.orderKey.localeCompare(b.orderKey));
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.optional(PRIORITY),
    assigneeAgentId: v.optional(v.id("agents")),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getOwnerId(ctx);
    const now = Date.now();
    return await ctx.db.insert("tasks", {
      ownerId,
      title: args.title,
      description: args.description,
      status: "todo",
      priority: args.priority ?? "medium",
      assigneeAgentId: args.assigneeAgentId,
      dueAt: args.dueAt,
      // Newer tasks sort to the top of their column.
      orderKey: String(Number.MAX_SAFE_INTEGER - now).padStart(20, "0"),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(STATUS),
    priority: v.optional(PRIORITY),
    assigneeAgentId: v.optional(v.union(v.id("agents"), v.null())),
    orderKey: v.optional(v.string()),
    dueAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { taskId, ...patch }) => {
    const ownerId = await getOwnerId(ctx);
    const task = await ctx.db.get(taskId);
    if (!task || task.ownerId !== ownerId) throw new Error("Not found");
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(taskId, { ...clean, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const ownerId = await getOwnerId(ctx);
    const task = await ctx.db.get(taskId);
    if (!task || task.ownerId !== ownerId) throw new Error("Not found");
    await ctx.db.delete(taskId);
  },
});
