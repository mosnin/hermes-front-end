import { v } from "convex/values";
import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";

/**
 * Per-Space model policy: a primary model, an ordered fallback chain, and
 * optional per-capability overrides. Agents and the engine route through
 * `pickModel` to resolve the concrete model to call.
 */
export type ModelPolicy = {
  primary: string;
  fallbacks: string[];
  byCapability?: Record<string, string>;
};

export const DEFAULT_POLICY: ModelPolicy = {
  primary: "claude-opus-4-8",
  fallbacks: ["claude-sonnet-4-6", "gpt-4o-mini"],
  byCapability: {},
};

/** The effective model policy for a Space (falls back to the default). */
export const getPolicy = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    return (scope.space.modelPolicy as ModelPolicy) ?? DEFAULT_POLICY;
  },
});

/** Admin-only: replace the Space's model policy. */
export const setPolicy = mutation({
  args: { spaceId: v.id("spaces"), policy: v.any() },
  handler: async (ctx, { spaceId, policy }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    await ctx.db.patch(spaceId, { modelPolicy: policy });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "system",
      action: "model_policy_set",
      summary: "Updated model policy",
    });
  },
});

/**
 * Resolve the single model to use for a Space (optionally for a capability).
 * This is the routing entrypoint the engine/runtime calls.
 */
export const pickModel = query({
  args: { spaceId: v.id("spaces"), capability: v.optional(v.string()) },
  handler: async (ctx, { spaceId, capability }) => {
    const scope = await resolveScope(ctx, spaceId);
    const p = (scope.space.modelPolicy as ModelPolicy) ?? DEFAULT_POLICY;
    return capability && p.byCapability?.[capability]
      ? p.byCapability[capability]
      : p.primary;
  },
});

// ---------------------------------------------------------------------------
// Capability-based agent routing (feature 11).
//
// Workflow steps and tasks declare `requiredCapabilities` (see schema.ts).
// This scorer ranks the Space's agents against those requirements plus
// health, recent cost, and harness match, so the dispatch path (currently
// `engine.ts#resolveAgentForStep`, which still does a naive first-match on
// `requiresCapability`) can pick the best agent instead of the first one.
// `engine.ts` is owned by another team — see the cross-team note in the
// Team C cycle report for the one-line call site to swap in
// `pickAgentForRequirements` here.
// ---------------------------------------------------------------------------

/** Weights for the composite routing score. Must sum to 1. */
export const ROUTING_WEIGHTS = {
  capability: 0.5,
  health: 0.2,
  cost: 0.15,
  harness: 0.15,
};

const RECENT_COST_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_COST_ROW_CAP = 1000; // bounded scan of the usage index

export type RoutingRequest = {
  requiredCapabilities?: string[];
  harness?: string;
  excludeAgentIds?: Id<"agents">[];
  /** Explicit override: bypass scoring and force this agent (still validated). */
  overrideAgentId?: Id<"agents">;
};

export type AgentRouteScore = {
  agentId: Id<"agents">;
  name: string;
  status: string;
  harness?: string;
  score: number;
  capabilityScore: number;
  healthScore: number;
  costScore: number;
  harnessScore: number;
  matchedCapabilities: string[];
  missingCapabilities: string[];
  recentCostUsd: number;
};

function healthScoreFor(agent: Doc<"agents">): number {
  if (agent.idleState === "hibernated") return 0;
  switch (agent.status) {
    case "online":
      return 1;
    case "degraded":
      return 0.5;
    case "pending":
      return 0.25;
    default:
      return 0;
  }
}

/**
 * Score every non-excluded agent in a Space against a set of routing
 * requirements. Pure/no side effects — safe to call from a query or mutation.
 */
export async function scoreAgentsForRequirements(
  ctx: QueryCtx | MutationCtx,
  spaceId: Id<"spaces">,
  req: RoutingRequest,
): Promise<AgentRouteScore[]> {
  const required = req.requiredCapabilities ?? [];
  const exclude = new Set(req.excludeAgentIds ?? []);

  const agents = (
    await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect()
  ).filter((a) => a.kind !== "a2a-external" && !exclude.has(a._id));

  const since = Date.now() - RECENT_COST_WINDOW_MS;
  const recentUsage = await ctx.db
    .query("usage")
    .withIndex("by_space_time", (q) =>
      q.eq("spaceId", spaceId).gte("createdAt", since),
    )
    .take(RECENT_COST_ROW_CAP);
  const costByAgent = new Map<string, number>();
  for (const u of recentUsage) {
    if (!u.agentId) continue;
    costByAgent.set(u.agentId, (costByAgent.get(u.agentId) ?? 0) + (u.costUsd ?? 0));
  }
  const maxCost = Math.max(0, ...Array.from(costByAgent.values()));

  const scores: AgentRouteScore[] = agents.map((a) => {
    const caps = a.capabilities ?? [];
    const matched = required.filter((c) => caps.includes(c));
    const missing = required.filter((c) => !caps.includes(c));
    const capabilityScore = required.length ? matched.length / required.length : 1;

    const healthScore = healthScoreFor(a);

    const recentCostUsd = costByAgent.get(a._id) ?? 0;
    const costScore = maxCost > 0 ? 1 - recentCostUsd / maxCost : 1;

    let harnessScore = 1;
    if (req.harness) {
      harnessScore = a.harness === req.harness ? 1 : 0.3;
    }

    const score =
      capabilityScore * ROUTING_WEIGHTS.capability +
      healthScore * ROUTING_WEIGHTS.health +
      costScore * ROUTING_WEIGHTS.cost +
      harnessScore * ROUTING_WEIGHTS.harness;

    return {
      agentId: a._id,
      name: a.name,
      status: a.status,
      harness: a.harness,
      score,
      capabilityScore,
      healthScore,
      costScore,
      harnessScore,
      matchedCapabilities: matched,
      missingCapabilities: missing,
      recentCostUsd,
    };
  });

  // Agents missing a required capability entirely never outrank a partial
  // match with the same score by accident — capability is already dominant
  // in the weighting, but tie-break on health then name for stability.
  return scores.sort(
    (a, b) => b.score - a.score || b.healthScore - a.healthScore || a.name.localeCompare(b.name),
  );
}

/**
 * Resolve the single best agent for a set of requirements, honoring an
 * explicit override. Returns null when no agent in the Space qualifies.
 */
export async function pickAgentForRequirements(
  ctx: QueryCtx | MutationCtx,
  spaceId: Id<"spaces">,
  req: RoutingRequest,
): Promise<Doc<"agents"> | null> {
  if (req.overrideAgentId) {
    const a = await ctx.db.get(req.overrideAgentId);
    return a && a.spaceId === spaceId ? a : null;
  }
  const scores = await scoreAgentsForRequirements(ctx, spaceId, req);
  const best = scores.find((s) => s.healthScore > 0) ?? scores[0];
  if (!best) return null;
  return await ctx.db.get(best.agentId);
}

/** UI/API entrypoint: rank agents in a Space for a set of capability needs. */
export const route = query({
  args: {
    spaceId: v.id("spaces"),
    requiredCapabilities: v.optional(v.array(v.string())),
    harness: v.optional(v.string()),
    excludeAgentIds: v.optional(v.array(v.id("agents"))),
  },
  handler: async (ctx, args): Promise<AgentRouteScore[]> => {
    await resolveScope(ctx, args.spaceId);
    return await scoreAgentsForRequirements(ctx, args.spaceId, args);
  },
});

/** UI/API entrypoint: pick (and optionally override) a single best agent. */
export const routeBest = query({
  args: {
    spaceId: v.id("spaces"),
    requiredCapabilities: v.optional(v.array(v.string())),
    harness: v.optional(v.string()),
    excludeAgentIds: v.optional(v.array(v.id("agents"))),
    overrideAgentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args): Promise<Doc<"agents"> | null> => {
    await resolveScope(ctx, args.spaceId);
    return await pickAgentForRequirements(ctx, args.spaceId, args);
  },
});

/**
 * Assign a task to its best-scoring agent (or an explicit override), stamping
 * `requiredCapabilities` routing onto the task's assignee. Records a work
 * event so the routing decision is auditable.
 */
export const routeTask = mutation({
  args: {
    spaceId: v.id("spaces"),
    taskId: v.id("tasks"),
    overrideAgentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, { spaceId, taskId, overrideAgentId }): Promise<Id<"agents"> | null> => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const task = await ctx.db.get(taskId);
    if (!task || task.spaceId !== spaceId) throw new Error("Not found");

    const agent = await pickAgentForRequirements(ctx, spaceId, {
      requiredCapabilities: task.requiredCapabilities,
      overrideAgentId,
    });
    if (!agent) return null;

    await ctx.db.patch(taskId, { assigneeAgentId: agent._id, updatedAt: Date.now() });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: overrideAgentId ? "user" : "system",
      actorId: overrideAgentId ? scope.userId : undefined,
      agentId: agent._id,
      category: "task",
      action: "capability_routed",
      summary: overrideAgentId
        ? `Task routed to ${agent.name} (manual override)`
        : `Task routed to ${agent.name} by capability match`,
      payload: { taskId, requiredCapabilities: task.requiredCapabilities ?? [] },
    });
    return agent._id;
  },
});
