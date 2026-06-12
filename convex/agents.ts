import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getOwnerId } from "./lib/auth";
import { generateToken, sha256Hex } from "./lib/crypto";

// ---------------------------------------------------------------------------
// Dashboard-facing functions
// ---------------------------------------------------------------------------

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getOwnerId(ctx);
    return await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const ownerId = await getOwnerId(ctx);
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.ownerId !== ownerId) return null;
    return agent;
  },
});

/**
 * Register a new agent. Runs as an action so it can generate and hash the
 * connector token with Web Crypto. Returns the raw token EXACTLY ONCE — the
 * user must copy it into their connector config; it is never retrievable again.
 */
export const create = action({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    platform: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<{ agentId: string; token: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const ownerId =
      (identity as { org_id?: string }).org_id ?? identity.subject;

    const token = generateToken();
    const tokenHash = await sha256Hex(token);

    const agentId: string = await ctx.runMutation(internal.agents.insert, {
      ownerId,
      name: args.name,
      description: args.description,
      platform: args.platform,
      tags: args.tags,
      tokenHash,
    });

    return { agentId, token };
  },
});

export const update = mutation({
  args: {
    agentId: v.id("agents"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    platform: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { agentId, ...patch }) => {
    const ownerId = await getOwnerId(ctx);
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.ownerId !== ownerId) throw new Error("Not found");
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(agentId, clean);
  },
});

export const remove = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const ownerId = await getOwnerId(ctx);
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.ownerId !== ownerId) throw new Error("Not found");
    await ctx.db.delete(agentId);
  },
});

// ---------------------------------------------------------------------------
// Internal functions (used by the create action and the connector HTTP API)
// ---------------------------------------------------------------------------

export const insert = internalMutation({
  args: {
    ownerId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    platform: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agents", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const byTokenHash = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
      .unique();
  },
});

/** Mark an agent online/degraded and record a heartbeat + reported metadata. */
export const recordHeartbeat = internalMutation({
  args: {
    agentId: v.id("agents"),
    status: v.optional(
      v.union(
        v.literal("online"),
        v.literal("degraded"),
        v.literal("offline"),
      ),
    ),
    connectorVersion: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, { agentId, ...patch }) => {
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(agentId, {
      ...clean,
      status: patch.status ?? "online",
      lastHeartbeat: Date.now(),
    });
  },
});
