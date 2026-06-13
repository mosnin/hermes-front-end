import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";
import { recordActivity, recordWorkEvent } from "./lib/events";

/** List chat bridges for a Space (newest first). */
export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("bridges")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
  },
});

/** Connect a new chat bridge (Slack / Telegram / Discord). */
export const connect = mutation({
  args: {
    spaceId: v.id("spaces"),
    type: v.string(),
    name: v.string(),
    agentId: v.optional(v.id("agents")),
    config: v.optional(v.any()),
  },
  handler: async (ctx, { spaceId, type, name, agentId, config }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const now = Date.now();
    const bridgeId = await ctx.db.insert("bridges", {
      companyId: scope.companyId,
      spaceId,
      type,
      name,
      status: "connected",
      config,
      agentId,
      createdAt: now,
      updatedAt: now,
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "integration",
      action: "bridge_connected",
      summary: `Connected ${type} bridge`,
    });
    return bridgeId;
  },
});

/** Route a bridge's incoming messages to an agent (or clear the routing). */
export const setAgent = mutation({
  args: {
    spaceId: v.id("spaces"),
    bridgeId: v.id("bridges"),
    agentId: v.union(v.id("agents"), v.null()),
  },
  handler: async (ctx, { spaceId, bridgeId, agentId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const row = await ctx.db.get(bridgeId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(bridgeId, {
      agentId: agentId ?? undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Remove a chat bridge. */
export const remove = mutation({
  args: { spaceId: v.id("spaces"), bridgeId: v.id("bridges") },
  handler: async (ctx, { spaceId, bridgeId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const row = await ctx.db.get(bridgeId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(bridgeId);
  },
});

/**
 * Fetch a bridge doc by id. Token-authenticated path — the control plane's
 * Slack webhook (http.ts) calls this to load bridge config (signingSecret,
 * botToken) before verifying and relaying an inbound event.
 */
export const getById = internalQuery({
  args: { bridgeId: v.id("bridges") },
  handler: async (ctx, { bridgeId }) => {
    return await ctx.db.get(bridgeId);
  },
});

/**
 * Relay an inbound Slack message into the routed agent's thread.
 *
 * Called by the control plane's Slack webhook (http.ts) after it has verified
 * the request against the bridge's signingSecret. Mirrors
 * threads.upsertFromConnector: the thread is keyed by the stable connector key
 * `slack:<bridgeId>` so every message from a given Slack bridge lands in one
 * thread. The agent's reply is posted back to Slack in a follow-up (chat.postMessage).
 */
export const handleInbound = internalMutation({
  args: {
    bridgeId: v.id("bridges"),
    userLabel: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { bridgeId, userLabel, text }) => {
    const bridge = await ctx.db.get(bridgeId);
    if (!bridge) return null;
    if (!bridge.agentId) {
      return { threadId: null, agentId: null };
    }
    const agentId = bridge.agentId;
    const connectorKey = `slack:${bridgeId}`;
    const now = Date.now();

    // Find or create the thread for this bridge (mirror upsertFromConnector).
    const existing = await ctx.db
      .query("threads")
      .withIndex("by_connector_key", (q) =>
        q.eq("agentId", agentId).eq("connectorKey", connectorKey),
      )
      .unique();
    let threadId;
    if (existing) {
      threadId = existing._id;
      await ctx.db.patch(threadId, {
        lastMessageAt: now,
        messageCount: (existing.messageCount ?? 0) + 1,
      });
    } else {
      threadId = await ctx.db.insert("threads", {
        companyId: bridge.companyId,
        spaceId: bridge.spaceId,
        agentId,
        connectorKey,
        title: `Slack: ${bridge.name}`,
        status: "active",
        messageCount: 1,
        createdAt: now,
        lastMessageAt: now,
      });
    }

    // Append the inbound message.
    await ctx.db.insert("messages", {
      companyId: bridge.companyId,
      spaceId: bridge.spaceId,
      threadId,
      agentId,
      role: "user",
      content: `[${userLabel}] ${text}`,
      createdAt: now,
    });

    await recordActivity(ctx, {
      companyId: bridge.companyId,
      spaceId: bridge.spaceId,
      agentId,
      threadId,
      type: "message",
      title: "Slack inbound",
      detail: text.slice(0, 140),
    });
    await recordWorkEvent(ctx, {
      companyId: bridge.companyId,
      spaceId: bridge.spaceId,
      actorType: "system",
      agentId,
      category: "integration",
      action: "slack_inbound",
      summary: `Slack message from ${userLabel}`,
    });

    return { threadId, agentId };
  },
});
