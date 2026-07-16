import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
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
