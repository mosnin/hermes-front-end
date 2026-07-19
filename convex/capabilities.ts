import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";

/**
 * Normalized tool layer (feature 12): a harness-neutral registry of
 * capability tags. Composio/MCP/builtin tools are mapped onto these tags per
 * Space via `capabilityGrants`, so a workflow step or task can declare
 * `requiredCapabilities: ["browser"]` without caring whether that resolves to
 * a Composio browser toolkit, an MCP server, or a builtin. The router
 * (router.ts) scores agents against these same tags; this module resolves
 * the tags into concrete tool names for execution.
 */
export const KNOWN_CAPABILITIES = [
  "code-gen",
  "browser",
  "search",
  "file-io",
  "email",
  "calendar",
  "crm",
  "spreadsheet",
  "database",
  "image-gen",
  "voice",
  "data-analysis",
  "deploy",
  "messaging",
  "web-scrape",
] as const;

export const PROVIDERS = v.union(
  v.literal("composio"),
  v.literal("mcp"),
  v.literal("builtin"),
);

/** The known capability tag catalog, for populating UI pickers. */
export const listKnown = query({
  args: {},
  handler: async () => KNOWN_CAPABILITIES,
});

// ---------------------------------------------------------------------------
// Grants — RBAC'd CRUD (admin: tool access is a security-relevant surface).
// ---------------------------------------------------------------------------

const GRANTS_PAGE_CAP = 500; // defensive bound — grants are admin-authored, not user-generated, but never .collect() unbounded.

/** All capability grants configured for a Space. */
export const listGrants = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("capabilityGrants")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(GRANTS_PAGE_CAP);
  },
});

/** Create or update a capability grant (admin-only: governs tool access). */
export const upsertGrant = mutation({
  args: {
    spaceId: v.id("spaces"),
    grantId: v.optional(v.id("capabilityGrants")),
    capability: v.string(),
    toolNames: v.array(v.string()),
    provider: v.optional(PROVIDERS),
    agentIds: v.optional(v.array(v.id("agents"))),
    enabled: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"capabilityGrants">> => {
    const scope = await resolveScope(ctx, args.spaceId);
    requireRole(scope, "admin");
    const now = Date.now();

    if (args.grantId) {
      const row = await ctx.db.get(args.grantId);
      if (!row || row.spaceId !== args.spaceId) throw new Error("Not found");
      await ctx.db.patch(args.grantId, {
        capability: args.capability,
        toolNames: args.toolNames,
        provider: args.provider,
        agentIds: args.agentIds,
        enabled: args.enabled,
        updatedAt: now,
      });
      await recordWorkEvent(ctx, {
        companyId: scope.companyId,
        spaceId: args.spaceId,
        actorType: "user",
        actorId: scope.userId,
        category: "governance",
        action: "capability_grant_updated",
        summary: `Updated capability grant "${args.capability}"`,
      });
      return args.grantId;
    }

    const id = await ctx.db.insert("capabilityGrants", {
      companyId: scope.companyId,
      spaceId: args.spaceId,
      capability: args.capability,
      toolNames: args.toolNames,
      provider: args.provider,
      agentIds: args.agentIds,
      enabled: args.enabled,
      grantedBy: scope.userId,
      createdAt: now,
      updatedAt: now,
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId: args.spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "governance",
      action: "capability_grant_created",
      summary: `Granted capability "${args.capability}" (${args.toolNames.length} tool${args.toolNames.length === 1 ? "" : "s"})`,
    });
    return id;
  },
});

export const removeGrant = mutation({
  args: { spaceId: v.id("spaces"), grantId: v.id("capabilityGrants") },
  handler: async (ctx, { spaceId, grantId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const row = await ctx.db.get(grantId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(grantId);
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "governance",
      action: "capability_grant_removed",
      summary: `Removed capability grant "${row.capability}"`,
    });
  },
});

// ---------------------------------------------------------------------------
// Resolution — capability tags -> concrete tool names.
// ---------------------------------------------------------------------------

async function resolveToolNames(
  ctx: { db: any },
  spaceId: Id<"spaces">,
  capabilityTags: string[],
  agentId: Id<"agents"> | undefined,
): Promise<{ capability: string; toolNames: string[]; provider?: string }[]> {
  const out: { capability: string; toolNames: string[]; provider?: string }[] = [];
  for (const capability of capabilityTags) {
    const grants = await ctx.db
      .query("capabilityGrants")
      .withIndex("by_space_capability", (q: any) =>
        q.eq("spaceId", spaceId).eq("capability", capability),
      )
      .collect();
    const tools = new Set<string>();
    let provider: string | undefined;
    for (const g of grants) {
      if (!g.enabled) continue;
      if (g.agentIds && g.agentIds.length && (!agentId || !g.agentIds.includes(agentId))) {
        continue;
      }
      for (const t of g.toolNames) tools.add(t);
      provider = provider ?? g.provider;
    }
    out.push({ capability, toolNames: Array.from(tools), provider });
  }
  return out;
}

/** UI/API: resolve a set of capability tags to their granted tool names. */
export const resolveTools = query({
  args: {
    spaceId: v.id("spaces"),
    capabilities: v.array(v.string()),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, { spaceId, capabilities, agentId }) => {
    await resolveScope(ctx, spaceId);
    return await resolveToolNames(ctx, spaceId, capabilities, agentId);
  },
});

/**
 * Connector-facing: the effective tool set for a deployed agent, given the
 * capability tags its current task/step declares. Called from the connector
 * HTTP surface (owned by another team — see cycle report for the wiring
 * request) after authenticating the agent by token, so no user identity is
 * required here.
 */
export const forConnector = internalQuery({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    capabilities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { spaceId, agentId, capabilities }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return [];
    const tags = capabilities && capabilities.length ? capabilities : agent.capabilities ?? [];
    if (!tags.length) return [];
    return await resolveToolNames(ctx, spaceId, tags, agentId);
  },
});

// ---------------------------------------------------------------------------
// A2A federation groundwork (feature 15): per-Space toggle to publish agent
// cards to a public cross-tenant directory. Inbound A2A calls still go
// through the existing per-agent guardrails (autonomy pause, guard config,
// A2A inbound key) — this only affects *discoverability*, not execution.
// ---------------------------------------------------------------------------

/** Admin-only: enable/disable the public directory for a whole Space. */
export const setDirectoryEnabled = mutation({
  args: { spaceId: v.id("spaces"), enabled: v.boolean() },
  handler: async (ctx, { spaceId, enabled }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    await ctx.db.patch(spaceId, { directoryEnabled: enabled });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "governance",
      action: enabled ? "directory_enabled" : "directory_disabled",
      summary: enabled
        ? "Enabled the public agent directory for this Space"
        : "Disabled the public agent directory for this Space",
    });
  },
});

/** Admin-only: publish/unpublish a single agent's card to the directory. */
export const setAgentPublished = mutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents"), published: v.boolean() },
  handler: async (ctx, { spaceId, agentId, published }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(agentId, { publishedToDirectory: published });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "governance",
      action: published ? "agent_published" : "agent_unpublished",
      summary: `${published ? "Published" : "Unpublished"} ${agent.name} ${published ? "to" : "from"} the public agent directory`,
    });
  },
});

/** Space-scoped: which of this Space's agents are published (for the network page toggle list). */
export const listPublishable = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return {
      directoryEnabled: scope.space.directoryEnabled ?? false,
      agents: agents
        .filter((a) => a.kind !== "a2a-external")
        .map((a) => ({
          agentId: a._id,
          name: a.name,
          description: a.description,
          status: a.status,
          capabilities: a.capabilities ?? [],
          published: a.publishedToDirectory ?? false,
        })),
    };
  },
});

const DIRECTORY_PAGE_SIZE = 30;

/**
 * Public (unauthenticated): the cross-tenant agent directory. Only surfaces
 * agents whose Space has `directoryEnabled` AND that are individually
 * `publishedToDirectory` — a deliberate double opt-in. No companyId/spaceId
 * or connector internals are exposed, only what a remote A2A client would
 * need to discover and call the agent's public card at
 * `/a2a/card/{agentId}`.
 */
export const publicDirectory = query({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("agents")
      .withIndex("by_directory", (q) => q.eq("publishedToDirectory", true))
      .paginate({ numItems: DIRECTORY_PAGE_SIZE, cursor: cursor ?? null });

    const spaceIds = Array.from(new Set(page.page.map((a) => a.spaceId)));
    const spaces = await Promise.all(spaceIds.map((id) => ctx.db.get(id)));
    const enabledSpaces = new Set(
      spaces.filter((s) => s && s.directoryEnabled).map((s) => s!._id),
    );

    return {
      ...page,
      page: page.page
        .filter((a) => enabledSpaces.has(a.spaceId))
        .map((a) => ({
          agentId: a._id,
          name: a.name,
          description: a.description,
          capabilities: a.capabilities ?? [],
          harness: a.harness,
          cardPath: `/a2a/card/${a._id}`,
        })),
    };
  },
});
