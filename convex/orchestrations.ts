import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getOwnerId } from "./lib/auth";

const STEP = v.object({
  id: v.string(),
  name: v.string(),
  agentId: v.optional(v.id("agents")),
  instruction: v.string(),
  dependsOn: v.optional(v.array(v.string())),
  status: v.optional(
    v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
    ),
  ),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getOwnerId(ctx);
    return await ctx.db
      .query("orchestrations")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    steps: v.optional(v.array(STEP)),
  },
  handler: async (ctx, { name, description, steps }) => {
    const ownerId = await getOwnerId(ctx);
    const now = Date.now();
    return await ctx.db.insert("orchestrations", {
      ownerId,
      name,
      description,
      status: "draft",
      steps: steps ?? [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("running"),
        v.literal("paused"),
        v.literal("completed"),
      ),
    ),
    steps: v.optional(v.array(STEP)),
  },
  handler: async (ctx, { orchestrationId, ...patch }) => {
    const ownerId = await getOwnerId(ctx);
    const row = await ctx.db.get(orchestrationId);
    if (!row || row.ownerId !== ownerId) throw new Error("Not found");
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(orchestrationId, { ...clean, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { orchestrationId: v.id("orchestrations") },
  handler: async (ctx, { orchestrationId }) => {
    const ownerId = await getOwnerId(ctx);
    const row = await ctx.db.get(orchestrationId);
    if (!row || row.ownerId !== ownerId) throw new Error("Not found");
    await ctx.db.delete(orchestrationId);
  },
});
