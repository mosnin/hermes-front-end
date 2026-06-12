import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";

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
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return rows.sort((a, b) => a.orderKey.localeCompare(b.orderKey));
  },
});

export const create = mutation({
  args: {
    spaceId: v.id("spaces"),
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.optional(PRIORITY),
    assigneeAgentId: v.optional(v.id("agents")),
    projectId: v.optional(v.id("projects")),
    goalId: v.optional(v.id("goals")),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, { spaceId, ...args }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const now = Date.now();
    return await ctx.db.insert("tasks", {
      companyId: scope.companyId,
      spaceId,
      title: args.title,
      description: args.description,
      status: "todo",
      priority: args.priority ?? "medium",
      assigneeAgentId: args.assigneeAgentId,
      projectId: args.projectId,
      goalId: args.goalId,
      dueAt: args.dueAt,
      orderKey: String(Number.MAX_SAFE_INTEGER - now).padStart(20, "0"),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    spaceId: v.id("spaces"),
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(STATUS),
    priority: v.optional(PRIORITY),
    assigneeAgentId: v.optional(v.union(v.id("agents"), v.null())),
    orderKey: v.optional(v.string()),
    dueAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { spaceId, taskId, ...patch }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const task = await ctx.db.get(taskId);
    if (!task || task.spaceId !== spaceId) throw new Error("Not found");
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, val]) => val !== undefined),
    );
    await ctx.db.patch(taskId, { ...clean, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), taskId: v.id("tasks") },
  handler: async (ctx, { spaceId, taskId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const task = await ctx.db.get(taskId);
    if (!task || task.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(taskId);
  },
});
