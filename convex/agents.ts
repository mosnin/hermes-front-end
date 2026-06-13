import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";
import { generateToken, sha256Hex } from "./lib/crypto";

export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }) => {
    await resolveScope(ctx, spaceId);
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return null;
    return agent;
  },
});

/**
 * Register a Hermes agent. Runs as an action to generate + hash the connector
 * token with Web Crypto. Returns the raw token ONCE.
 */
export const create = action({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    platform: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<{ agentId: string; token: string }> => {
    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const agentId: string = await ctx.runMutation(internal.agents.insert, {
      ...args,
      tokenHash,
    });
    return { agentId, token };
  },
});

export const insert = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    platform: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    tokenHash: v.string(),
  },
  handler: async (ctx, { spaceId, tokenHash, ...rest }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agentId = await ctx.db.insert("agents", {
      companyId: scope.companyId,
      spaceId,
      kind: "hermes",
      status: "pending",
      tokenHash,
      createdAt: Date.now(),
      ...rest,
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "agent",
      action: "registered",
      summary: `Registered agent ${rest.name}`,
    });
    return agentId;
  },
});

/** Register an external A2A agent by its Agent Card URL (Phase 4 wires calls). */
export const registerExternal = mutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    cardUrl: v.string(),
    capabilities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { spaceId, name, cardUrl, capabilities }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    return await ctx.db.insert("agents", {
      companyId: scope.companyId,
      spaceId,
      kind: "a2a-external",
      name,
      cardUrl,
      capabilities,
      status: "offline",
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    platform: v.optional(v.string()),
    squadId: v.optional(v.id("squads")),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { spaceId, agentId, ...patch }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, val]) => val !== undefined),
    );
    await ctx.db.patch(agentId, clean);
  },
});

export const updatePersona = mutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    systemPrompt: v.optional(v.string()),
    model: v.optional(v.string()),
    modelProvider: v.optional(v.string()),
    toolsets: v.optional(v.array(v.string())),
    reportsTo: v.optional(v.union(v.id("agents"), v.null())),
  },
  handler: async (ctx, { spaceId, agentId, ...patch }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, val]) => val !== undefined),
    );
    await ctx.db.patch(agentId, clean);
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(agentId);
  },
});

/** Mint an inbound A2A key so external A2A clients can call this agent. */
export const rotateInboundKey = action({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }): Promise<{ key: string }> => {
    const key = generateToken();
    const keyHash = await sha256Hex(key);
    await ctx.runMutation(internal.agents.setInboundKeyHash, {
      spaceId,
      agentId,
      keyHash,
    });
    return { key };
  },
});

export const setInboundKeyHash = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    keyHash: v.string(),
  },
  handler: async (ctx, { spaceId, agentId, keyHash }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(agentId, { a2aInboundKeyHash: keyHash });
  },
});

// --- connector internals (token-authenticated, no user identity) ------------

/** Fetch an agent for the public A2A endpoints (card + JSON-RPC). */
export const getForA2A = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    return await ctx.db.get(agentId);
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
      Object.entries(patch).filter(([, val]) => val !== undefined),
    );
    await ctx.db.patch(agentId, {
      ...clean,
      status: patch.status ?? "online",
      lastHeartbeat: Date.now(),
    });
  },
});
