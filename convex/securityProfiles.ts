import { v } from "convex/values";
import { query, mutation, internalQuery, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";

/**
 * Security profiles (feature 17): named container/tool policies attachable to
 * agents. `toolAllowlist` is enforced server-side today via `isToolAllowed` /
 * `assertToolAllowed` below — call these from any module that dispatches a
 * tool call on behalf of an agent (router, connector HTTP routes, workflow
 * engine). `egressAllowlist` / `fsQuotaMb` / `secretScopes` /
 * `containerPolicy` are NOT enforceable from Convex itself (no network
 * boundary here) — they're forwarded verbatim to the fleet worker's /spawn
 * call as container policy; enforcement happens in the container runtime.
 *
 * Cross-team request (Team A / fleet worker): /spawn needs a `containerPolicy`
 * field so egress allowlist + fs quota can actually be applied at the
 * container boundary — see fleet.ts's spawnAgent() call site, which currently
 * has no place to pass this through.
 */

// --- CRUD --------------------------------------------------------------------

export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("securityProfiles")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { spaceId: v.id("spaces"), profileId: v.id("securityProfiles") },
  handler: async (ctx, { spaceId, profileId }) => {
    await resolveScope(ctx, spaceId);
    const p = await ctx.db.get(profileId);
    if (!p || p.spaceId !== spaceId) return null;
    return p;
  },
});

/** Agents currently attached to a profile — shown before delete/edit. */
export const agentsUsingProfile = query({
  args: { spaceId: v.id("spaces"), profileId: v.id("securityProfiles") },
  handler: async (ctx, { spaceId, profileId }) => {
    await resolveScope(ctx, spaceId);
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return agents
      .filter((a) => a.securityProfileId === profileId)
      .map((a) => ({ _id: a._id, name: a.name, status: a.status }));
  },
});

function validatePolicy(args: {
  egressAllowlist?: string[];
  fsQuotaMb?: number;
  toolAllowlist?: string[];
  secretScopes?: string[];
}): void {
  if (args.fsQuotaMb !== undefined && (args.fsQuotaMb <= 0 || !Number.isFinite(args.fsQuotaMb))) {
    throw new Error("fsQuotaMb must be a positive number");
  }
  if (args.egressAllowlist) {
    for (const host of args.egressAllowlist) {
      if (!host.trim()) throw new Error("egressAllowlist entries must be non-empty");
    }
  }
  if (args.toolAllowlist) {
    for (const tool of args.toolAllowlist) {
      if (!tool.trim()) throw new Error("toolAllowlist entries must be non-empty");
    }
  }
  if (args.secretScopes) {
    for (const s of args.secretScopes) {
      if (!s.trim()) throw new Error("secretScopes entries must be non-empty");
    }
  }
}

export const create = mutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    egressAllowlist: v.optional(v.array(v.string())),
    fsQuotaMb: v.optional(v.number()),
    secretScopes: v.optional(v.array(v.string())),
    toolAllowlist: v.optional(v.array(v.string())),
    containerPolicy: v.optional(v.any()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, { spaceId, isDefault, ...rest }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    if (!rest.name.trim()) throw new Error("Name is required");
    validatePolicy(rest);

    const dup = await ctx.db
      .query("securityProfiles")
      .withIndex("by_space_name", (q) => q.eq("spaceId", spaceId).eq("name", rest.name))
      .unique();
    if (dup) throw new Error(`A security profile named "${rest.name}" already exists`);

    const now = Date.now();
    if (isDefault) await clearDefault(ctx, spaceId);

    const profileId = await ctx.db.insert("securityProfiles", {
      companyId: scope.companyId,
      spaceId,
      ...rest,
      isDefault: isDefault ?? false,
      createdBy: scope.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "governance",
      action: "security_profile_created",
      summary: `Created security profile "${rest.name}"`,
    });
    return profileId;
  },
});

export const update = mutation({
  args: {
    spaceId: v.id("spaces"),
    profileId: v.id("securityProfiles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    egressAllowlist: v.optional(v.array(v.string())),
    fsQuotaMb: v.optional(v.number()),
    secretScopes: v.optional(v.array(v.string())),
    toolAllowlist: v.optional(v.array(v.string())),
    containerPolicy: v.optional(v.any()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, { spaceId, profileId, isDefault, ...rest }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.spaceId !== spaceId) throw new Error("Not found");
    validatePolicy(rest);

    if (rest.name && rest.name !== profile.name) {
      const dup = await ctx.db
        .query("securityProfiles")
        .withIndex("by_space_name", (q) => q.eq("spaceId", spaceId).eq("name", rest.name as string))
        .unique();
      if (dup) throw new Error(`A security profile named "${rest.name}" already exists`);
    }

    if (isDefault) await clearDefault(ctx, spaceId, profileId);

    await ctx.db.patch(profileId, {
      ...rest,
      ...(isDefault !== undefined ? { isDefault } : {}),
      updatedAt: Date.now(),
    });

    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "governance",
      action: "security_profile_updated",
      summary: `Updated security profile "${profile.name}"`,
    });
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), profileId: v.id("securityProfiles") },
  handler: async (ctx, { spaceId, profileId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.spaceId !== spaceId) throw new Error("Not found");

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const inUse = agents.filter((a) => a.securityProfileId === profileId);
    if (inUse.length > 0) {
      throw new Error(
        `Cannot delete: ${inUse.length} agent(s) are attached to this profile. Reassign them first.`,
      );
    }

    await ctx.db.delete(profileId);
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "governance",
      action: "security_profile_deleted",
      summary: `Deleted security profile "${profile.name}"`,
    });
  },
});

/** Attach (or clear, with profileId=null) a security profile to an agent. */
export const assign = mutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    profileId: v.union(v.id("securityProfiles"), v.null()),
  },
  handler: async (ctx, { spaceId, agentId, profileId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Agent not found");
    if (profileId) {
      const profile = await ctx.db.get(profileId);
      if (!profile || profile.spaceId !== spaceId) throw new Error("Security profile not found");
    }
    await ctx.db.patch(agentId, { securityProfileId: profileId ?? undefined });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "governance",
      action: "security_profile_assigned",
      summary: profileId
        ? `Attached security profile to ${agent.name}`
        : `Cleared security profile from ${agent.name}`,
    });
  },
});

async function clearDefault(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
  except?: Id<"securityProfiles">,
): Promise<void> {
  const rows = await ctx.db
    .query("securityProfiles")
    .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
    .collect();
  for (const r of rows as Doc<"securityProfiles">[]) {
    if (r.isDefault && r._id !== except) {
      await ctx.db.patch(r._id, { isDefault: false });
    }
  }
}

// --- Enforcement (server-side, callable from other modules) -----------------

/**
 * Pure tool-allowlist check: no allowlist set = unrestricted (back-compat for
 * agents without a profile). Import this directly into router/connector
 * modules — it's a plain function, not a Convex function, so it's zero-cost
 * to call from a query, mutation, or action handler.
 */
export function isToolAllowed(
  profile: Pick<Doc<"securityProfiles">, "toolAllowlist"> | null | undefined,
  toolName: string,
): boolean {
  if (!profile || !profile.toolAllowlist || profile.toolAllowlist.length === 0) return true;
  return profile.toolAllowlist.includes(toolName);
}

/** Throws GuardViolation-style Error if the tool isn't in the agent's profile allowlist. */
export function assertToolAllowed(
  profile: Pick<Doc<"securityProfiles">, "toolAllowlist"> | null | undefined,
  toolName: string,
): void {
  if (!isToolAllowed(profile, toolName)) {
    throw new Error(`Tool "${toolName}" is not permitted by this agent's security profile`);
  }
}

/**
 * Cross-module entrypoint: resolves an agent's security profile (if any) and
 * checks a tool name against its allowlist. Callable via
 * ctx.runQuery(api.securityProfiles.checkAgentTool, {...}) from any module
 * without importing convex/securityProfiles.ts's internals directly.
 */
export const checkAgentTool = query({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents"), toolName: v.string() },
  handler: async (ctx, { spaceId, agentId, toolName }) => {
    await resolveScope(ctx, spaceId);
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return { allowed: false, reason: "agent not found" };
    if (!agent.securityProfileId) return { allowed: true };
    const profile = await ctx.db.get(agent.securityProfileId);
    const allowed = isToolAllowed(profile, toolName);
    return { allowed, reason: allowed ? undefined : "not in security profile tool allowlist" };
  },
});

export const byIdInternal = internalQuery({
  args: { profileId: v.id("securityProfiles") },
  handler: async (ctx, { profileId }) => ctx.db.get(profileId),
});
