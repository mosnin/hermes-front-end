import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordActivity, recordWorkEvent } from "./lib/events";
import {
  buildOutboundRequest,
  interpretOutboundResponse,
} from "./lib/channels";
import { assertFeature, assertWithinPlanCount } from "./lib/plans";

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
    assertFeature(scope, "bridges");
    await assertWithinPlanCount(ctx, scope, "bridges", "maxBridges");
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

/** Record an outbound bridge delivery (activity + work event). */
export const recordOutbound = internalMutation({
  args: {
    bridgeId: v.id("bridges"),
    text: v.string(),
    ok: v.boolean(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, { bridgeId, text, ok, detail }) => {
    const bridge = await ctx.db.get(bridgeId);
    if (!bridge) return;
    await ctx.db.patch(bridgeId, {
      status: ok ? "connected" : "error",
      updatedAt: Date.now(),
    });
    await recordActivity(ctx, {
      companyId: bridge.companyId,
      spaceId: bridge.spaceId,
      agentId: bridge.agentId,
      type: "message",
      title: ok ? `${bridge.type} outbound` : `${bridge.type} send failed`,
      detail: (ok ? text : `${detail ?? "error"}: ${text}`).slice(0, 140),
    });
    await recordWorkEvent(ctx, {
      companyId: bridge.companyId,
      spaceId: bridge.spaceId,
      actorType: "agent",
      agentId: bridge.agentId,
      category: "integration",
      action: ok ? "bridge_outbound" : "bridge_outbound_failed",
      summary: `${bridge.type} → ${ok ? "delivered" : detail ?? "failed"}`,
    });
  },
});

/**
 * Send a message OUT to a bridge's channel (Slack chat.postMessage, Telegram
 * sendMessage, Discord webhook). Real network delivery via lib/channels; logs
 * the result. Called by the /bridges/send connector endpoint and the UI
 * test-send. Returns {ok, detail}.
 */
export const sendOutbound = internalAction({
  args: { bridgeId: v.id("bridges"), text: v.string() },
  handler: async (ctx, { bridgeId, text }): Promise<{ ok: boolean; detail?: string }> => {
    const bridge = await ctx.runQuery(internal.bridges.getById, { bridgeId });
    if (!bridge) return { ok: false, detail: "unknown bridge" };
    const spec = buildOutboundRequest(bridge.type, bridge.config, text);
    if ("error" in spec) {
      await ctx.runMutation(internal.bridges.recordOutbound, {
        bridgeId,
        text,
        ok: false,
        detail: spec.error,
      });
      return { ok: false, detail: spec.error };
    }
    let result: { ok: boolean; detail?: string };
    try {
      const resp = await fetch(spec.url, {
        method: "POST",
        headers: spec.headers,
        body: spec.body,
      });
      const bodyText = await resp.text().catch(() => "");
      result = interpretOutboundResponse(bridge.type, resp.status, bodyText);
    } catch (e) {
      result = { ok: false, detail: String(e) };
    }
    await ctx.runMutation(internal.bridges.recordOutbound, {
      bridgeId,
      text,
      ok: result.ok,
      detail: result.detail,
    });
    return result;
  },
});

/** UI/API test-send: post a message to a bridge's channel now. */
export const send = action({
  args: { spaceId: v.id("spaces"), bridgeId: v.id("bridges"), text: v.string() },
  handler: async (ctx, { spaceId, bridgeId, text }): Promise<{ ok: boolean; detail?: string }> => {
    // Authorize against the Space before dispatching the (unauth'd) action.
    const bridge = await ctx.runQuery(internal.bridges.authForSpace, {
      spaceId,
      bridgeId,
    });
    if (!bridge) throw new Error("Not found");
    return await ctx.runAction(internal.bridges.sendOutbound, { bridgeId, text });
  },
});

/** Verify a bridge belongs to a Space the caller may operate; returns it. */
export const authForSpace = internalQuery({
  args: { spaceId: v.id("spaces"), bridgeId: v.id("bridges") },
  handler: async (ctx, { spaceId, bridgeId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const row = await ctx.db.get(bridgeId);
    if (!row || row.spaceId !== spaceId) return null;
    return row;
  },
});

/** Find a bridge routed to an agent (for connector outbound by agent). */
export const forAgentSend = internalQuery({
  args: { agentId: v.id("agents"), bridgeId: v.id("bridges") },
  handler: async (ctx, { agentId, bridgeId }) => {
    const row = await ctx.db.get(bridgeId);
    if (!row) return null;
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== row.spaceId) return null;
    return row;
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
