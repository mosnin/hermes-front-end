import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";

/** MCP server connections for a Space (newest first). */
export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("mcpServers")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
  },
});

/** Connect an existing MCP server so agents can use its tools. */
export const add = mutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    url: v.string(),
    transport: v.union(v.literal("sse"), v.literal("http"), v.literal("stdio")),
    authHeader: v.optional(v.string()),
    scope: v.union(v.literal("space"), v.literal("agent")),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const scope = await resolveScope(ctx, args.spaceId);
    requireRole(scope, "operator");
    const now = Date.now();
    const id = await ctx.db.insert("mcpServers", {
      companyId: scope.companyId,
      spaceId: args.spaceId,
      name: args.name,
      url: args.url,
      transport: args.transport,
      authHeader: args.authHeader,
      scope: args.scope,
      agentId: args.scope === "agent" ? args.agentId : undefined,
      status: "connected",
      createdAt: now,
      updatedAt: now,
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId: args.spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId: args.scope === "agent" ? args.agentId : undefined,
      category: "integration",
      action: "mcp_connected",
      summary: `Connected MCP server ${args.name}`,
    });
    return id;
  },
});

/** Update an MCP server's status (connected / disconnected / error). */
export const setStatus = mutation({
  args: {
    spaceId: v.id("spaces"),
    mcpId: v.id("mcpServers"),
    status: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error"),
    ),
  },
  handler: async (ctx, { spaceId, mcpId, status }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const row = await ctx.db.get(mcpId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(mcpId, { status, updatedAt: Date.now() });
  },
});

/** Remove an MCP server connection. */
export const remove = mutation({
  args: { spaceId: v.id("spaces"), mcpId: v.id("mcpServers") },
  handler: async (ctx, { spaceId, mcpId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const row = await ctx.db.get(mcpId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(mcpId);
  },
});

/**
 * Connector-facing: the MCP servers that apply to a deployed agent — space-wide
 * servers plus any bound directly to the agent. Used by the orchestrator's
 * /connector/mcp endpoint so agents know which MCP servers to connect.
 */
export const forConnector = internalQuery({
  args: { spaceId: v.id("spaces"), agentId: v.optional(v.id("agents")) },
  handler: async (ctx, { spaceId, agentId }) => {
    const rows = await ctx.db
      .query("mcpServers")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return rows
      .filter(
        (r) =>
          r.status === "connected" &&
          (r.scope === "space" || (agentId && r.agentId === agentId)),
      )
      .map((r) => ({
        name: r.name,
        url: r.url,
        transport: r.transport,
        authHeader: r.authHeader,
        tools: r.tools,
      }));
  },
});
