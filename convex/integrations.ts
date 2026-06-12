import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalAction,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveScope, requireRole } from "./lib/auth";
import { recordActivity, recordWorkEvent } from "./lib/events";
import { recordUsage } from "./lib/metering";
import {
  composioConfigured,
  composioUserId,
  createConnection,
  executeTool,
  listConnections,
  upsertTrigger,
} from "./lib/composio";

/** Supported toolkits (Composio slugs). Connect via managed OAuth. */
const CATALOG = [
  { toolkit: "slack", name: "Slack", body: "Post and respond in channels." },
  { toolkit: "github", name: "GitHub", body: "PRs, issues, code." },
  { toolkit: "gmail", name: "Gmail", body: "Read and send email." },
  { toolkit: "linear", name: "Linear", body: "Issues and projects." },
  { toolkit: "notion", name: "Notion", body: "Docs and databases." },
  { toolkit: "googlecalendar", name: "Google Calendar", body: "Events." },
];

export const catalog = query({
  args: {},
  handler: async () => CATALOG,
});

export const status = query({
  args: {},
  handler: async () => ({ composioConfigured: composioConfigured() }),
});

export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("integrations")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
  },
});

// --- manual (non-Composio) connect, kept for custom integrations ------------

export const connect = mutation({
  args: {
    spaceId: v.id("spaces"),
    type: v.string(),
    name: v.string(),
    config: v.optional(v.any()),
  },
  handler: async (ctx, { spaceId, type, name, config }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const now = Date.now();
    return await ctx.db.insert("integrations", {
      companyId: scope.companyId,
      spaceId,
      type,
      name,
      status: "connected",
      config,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), integrationId: v.id("integrations") },
  handler: async (ctx, { spaceId, integrationId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const row = await ctx.db.get(integrationId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(integrationId);
  },
});

// ===========================================================================
// Composio-backed: connect (OAuth), reconcile, execute tools, triggers
// ===========================================================================

export const adminScope = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const s = await resolveScope(ctx, spaceId);
    requireRole(s, "admin");
    return { companyId: s.companyId };
  },
});

export const upsertComposio = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    companyId: v.string(),
    toolkit: v.string(),
    name: v.string(),
    authConfigId: v.string(),
    connectedAccountId: v.optional(v.string()),
    userId: v.string(),
    redirectUrl: v.optional(v.string()),
    connected: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = (
      await ctx.db
        .query("integrations")
        .withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
        .collect()
    ).find((i) => i.type === args.toolkit && i.config?.provider === "composio");
    const config = {
      provider: "composio",
      toolkit: args.toolkit,
      authConfigId: args.authConfigId,
      connectedAccountId: args.connectedAccountId,
      userId: args.userId,
      redirectUrl: args.redirectUrl,
    };
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.connected ? "connected" : "disconnected",
        config,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("integrations", {
      companyId: args.companyId,
      spaceId: args.spaceId,
      type: args.toolkit,
      name: args.name,
      status: args.connected ? "connected" : "disconnected",
      config,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Start a managed-OAuth connection for a toolkit; returns the redirect URL. */
export const initiate = action({
  args: {
    spaceId: v.id("spaces"),
    toolkit: v.string(),
    name: v.string(),
    authConfigId: v.string(),
  },
  handler: async (ctx, args): Promise<{ redirectUrl?: string }> => {
    const { companyId } = await ctx.runQuery(internal.integrations.adminScope, {
      spaceId: args.spaceId,
    });
    const userId = composioUserId(args.spaceId);
    const conn = await createConnection(args.authConfigId, userId);
    await ctx.runMutation(internal.integrations.upsertComposio, {
      spaceId: args.spaceId,
      companyId,
      toolkit: args.toolkit,
      name: args.name,
      authConfigId: args.authConfigId,
      connectedAccountId: conn.id,
      userId,
      redirectUrl: conn.redirectUrl,
      connected: conn.status === "ACTIVE",
    });
    return { redirectUrl: conn.redirectUrl };
  },
});

/** Reconcile connection status from Composio (call after completing OAuth). */
export const refresh = action({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }): Promise<{ active: number }> => {
    await ctx.runQuery(internal.integrations.adminScope, { spaceId });
    const userId = composioUserId(spaceId);
    const conns = await listConnections(userId);
    const activeIds = new Set(
      conns
        .filter((c: any) => (c.status ?? "").toUpperCase() === "ACTIVE")
        .map((c: any) => c.id ?? c.nanoid),
    );
    await ctx.runMutation(internal.integrations.reconcile, {
      spaceId,
      activeIds: [...activeIds] as string[],
    });
    return { active: activeIds.size };
  },
});

export const reconcile = internalMutation({
  args: { spaceId: v.id("spaces"), activeIds: v.array(v.string()) },
  handler: async (ctx, { spaceId, activeIds }) => {
    const rows = await ctx.db
      .query("integrations")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const active = new Set(activeIds);
    for (const r of rows) {
      if (r.config?.provider !== "composio") continue;
      const connected = active.has(r.config?.connectedAccountId);
      await ctx.db.patch(r._id, {
        status: connected ? "connected" : "disconnected",
        updatedAt: Date.now(),
      });
    }
  },
});

export const composioAccount = internalQuery({
  args: { spaceId: v.id("spaces"), toolkit: v.string(), requireAuth: v.boolean() },
  handler: async (ctx, { spaceId, toolkit, requireAuth }) => {
    if (requireAuth) {
      const s = await resolveScope(ctx, spaceId);
      requireRole(s, "operator");
    }
    const row = (
      await ctx.db
        .query("integrations")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .collect()
    ).find((i) => i.type === toolkit && i.config?.provider === "composio");
    if (!row) return null;
    return {
      companyId: row.companyId,
      userId: row.config?.userId as string,
      connectedAccountId: row.config?.connectedAccountId as string | undefined,
    };
  },
});

export const recordCall = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    companyId: v.string(),
    toolkit: v.string(),
    tool: v.string(),
    agentId: v.optional(v.id("agents")),
    ok: v.boolean(),
  },
  handler: async (ctx, { spaceId, companyId, toolkit, tool, agentId, ok }) => {
    await recordActivity(ctx, {
      companyId,
      spaceId,
      agentId,
      type: ok ? "tool_call" : "error",
      title: `${toolkit}.${tool}`,
      detail: ok ? "executed via Composio" : "failed",
    });
    await recordWorkEvent(ctx, {
      companyId,
      spaceId,
      actorType: agentId ? "agent" : "user",
      agentId,
      category: "integration",
      action: ok ? "tool_executed" : "tool_failed",
      summary: `Ran ${toolkit}.${tool}`,
    });
    if (ok) {
      await recordUsage(ctx, { companyId, spaceId, agentId, kind: "tool" });
    }
  },
});

/** Execute a Composio tool (dashboard or agent). */
export const execute = action({
  args: {
    spaceId: v.id("spaces"),
    toolkit: v.string(),
    tool: v.string(),
    arguments: v.optional(v.any()),
  },
  handler: async (ctx, { spaceId, toolkit, tool, arguments: args }) => {
    const acct = await ctx.runQuery(internal.integrations.composioAccount, {
      spaceId,
      toolkit,
      requireAuth: true,
    });
    if (!acct) throw new Error(`No connected ${toolkit} integration`);
    const result = await executeTool(
      tool,
      acct.userId,
      args ?? {},
      acct.connectedAccountId,
    );
    await ctx.runMutation(internal.integrations.recordCall, {
      spaceId,
      companyId: acct.companyId,
      toolkit,
      tool,
      ok: true,
    });
    return result;
  },
});

/** Agent-facing execution (token-authenticated, via the connector HTTP API). */
export const executeForConnector = internalAction({
  args: {
    spaceId: v.id("spaces"),
    companyId: v.string(),
    agentId: v.id("agents"),
    toolkit: v.string(),
    tool: v.string(),
    arguments: v.optional(v.any()),
  },
  handler: async (ctx, { spaceId, companyId, agentId, toolkit, tool, arguments: args }) => {
    const acct = await ctx.runQuery(internal.integrations.composioAccount, {
      spaceId,
      toolkit,
      requireAuth: false,
    });
    if (!acct) throw new Error(`No connected ${toolkit} integration`);
    try {
      const result = await executeTool(tool, acct.userId, args ?? {}, acct.connectedAccountId);
      await ctx.runMutation(internal.integrations.recordCall, {
        spaceId, companyId, toolkit, tool, agentId, ok: true,
      });
      return { ok: true, result };
    } catch (e) {
      await ctx.runMutation(internal.integrations.recordCall, {
        spaceId, companyId, toolkit, tool, agentId, ok: false,
      });
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
});

/** Enable a Composio trigger and bind it to a workflow (fires on events). */
export const enableTrigger = action({
  args: {
    spaceId: v.id("spaces"),
    toolkit: v.string(),
    triggerSlug: v.string(),
    workflowId: v.id("workflows"),
    triggerConfig: v.optional(v.any()),
  },
  handler: async (ctx, { spaceId, toolkit, triggerSlug, workflowId, triggerConfig }) => {
    const { companyId } = await ctx.runQuery(internal.integrations.adminScope, { spaceId });
    const userId = composioUserId(spaceId);
    await upsertTrigger(triggerSlug, userId, triggerConfig ?? {});
    await ctx.runMutation(internal.integrations.createEventTrigger, {
      spaceId,
      companyId,
      workflowId,
      eventType: `composio.${toolkit}.${triggerSlug}`.toLowerCase(),
    });
    return { ok: true };
  },
});

export const createEventTrigger = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    companyId: v.string(),
    workflowId: v.id("workflows"),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("triggers", {
      companyId: args.companyId,
      spaceId: args.spaceId,
      workflowId: args.workflowId,
      kind: "event",
      eventType: args.eventType,
      enabled: true,
      createdAt: Date.now(),
    });
  },
});
