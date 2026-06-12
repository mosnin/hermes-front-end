import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";

const GOAL_STATUS = v.union(
  v.literal("active"),
  v.literal("at_risk"),
  v.literal("done"),
  v.literal("archived"),
);
const PROJECT_STATUS = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("done"),
  v.literal("archived"),
);

/** Goals + projects with task rollups (progress derived from linked tasks). */
export const board = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const [goals, projects, tasks] = await Promise.all([
      ctx.db
        .query("goals")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .order("desc")
        .collect(),
      ctx.db
        .query("projects")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .order("desc")
        .collect(),
      ctx.db
        .query("tasks")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .collect(),
    ]);

    const rollup = (pred: (t: (typeof tasks)[number]) => boolean) => {
      const ts = tasks.filter(pred);
      const done = ts.filter((t) => t.status === "done").length;
      return { total: ts.length, done, progress: ts.length ? done / ts.length : 0 };
    };

    return {
      goals: goals.map((g) => ({ ...g, ...rollup((t) => t.goalId === g._id) })),
      projects: projects.map((p) => ({
        ...p,
        ...rollup((t) => t.projectId === p._id),
      })),
    };
  },
});

export const createGoal = mutation({
  args: {
    spaceId: v.id("spaces"),
    title: v.string(),
    description: v.optional(v.string()),
    targetDate: v.optional(v.number()),
  },
  handler: async (ctx, { spaceId, ...rest }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const now = Date.now();
    return await ctx.db.insert("goals", {
      companyId: scope.companyId,
      spaceId,
      status: "active",
      progress: 0,
      ...rest,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateGoal = mutation({
  args: {
    spaceId: v.id("spaces"),
    goalId: v.id("goals"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(GOAL_STATUS),
    targetDate: v.optional(v.number()),
  },
  handler: async (ctx, { spaceId, goalId, ...patch }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const g = await ctx.db.get(goalId);
    if (!g || g.spaceId !== spaceId) throw new Error("Not found");
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, val]) => val !== undefined),
    );
    await ctx.db.patch(goalId, { ...clean, updatedAt: Date.now() });
  },
});

export const removeGoal = mutation({
  args: { spaceId: v.id("spaces"), goalId: v.id("goals") },
  handler: async (ctx, { spaceId, goalId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const g = await ctx.db.get(goalId);
    if (!g || g.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(goalId);
  },
});

export const createProject = mutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    goalId: v.optional(v.id("goals")),
  },
  handler: async (ctx, { spaceId, ...rest }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const now = Date.now();
    return await ctx.db.insert("projects", {
      companyId: scope.companyId,
      spaceId,
      status: "active",
      ...rest,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateProject = mutation({
  args: {
    spaceId: v.id("spaces"),
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    status: v.optional(PROJECT_STATUS),
    goalId: v.optional(v.union(v.id("goals"), v.null())),
  },
  handler: async (ctx, { spaceId, projectId, ...patch }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const p = await ctx.db.get(projectId);
    if (!p || p.spaceId !== spaceId) throw new Error("Not found");
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, val]) => val !== undefined),
    );
    await ctx.db.patch(projectId, { ...clean, updatedAt: Date.now() });
  },
});

export const removeProject = mutation({
  args: { spaceId: v.id("spaces"), projectId: v.id("projects") },
  handler: async (ctx, { spaceId, projectId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const p = await ctx.db.get(projectId);
    if (!p || p.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(projectId);
  },
});
