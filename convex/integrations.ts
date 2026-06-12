import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getOwnerId } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getOwnerId(ctx);
    return await ctx.db
      .query("integrations")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
  },
});

export const connect = mutation({
  args: {
    type: v.string(),
    name: v.string(),
    config: v.optional(v.any()),
  },
  handler: async (ctx, { type, name, config }) => {
    const ownerId = await getOwnerId(ctx);
    const now = Date.now();
    return await ctx.db.insert("integrations", {
      ownerId,
      type,
      name,
      status: "connected",
      config,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setStatus = mutation({
  args: {
    integrationId: v.id("integrations"),
    status: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error"),
    ),
  },
  handler: async (ctx, { integrationId, status }) => {
    const ownerId = await getOwnerId(ctx);
    const row = await ctx.db.get(integrationId);
    if (!row || row.ownerId !== ownerId) throw new Error("Not found");
    await ctx.db.patch(integrationId, { status, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, { integrationId }) => {
    const ownerId = await getOwnerId(ctx);
    const row = await ctx.db.get(integrationId);
    if (!row || row.ownerId !== ownerId) throw new Error("Not found");
    await ctx.db.delete(integrationId);
  },
});
