import { MutationCtx } from "../_generated/server";
import { Scope } from "./auth";
import { GuardViolation } from "./guards";

/**
 * Plan tiers and their hard limits. Enforced server-side so a plan is a real
 * entitlement boundary, not a cosmetic label. Upgrades lift the ceiling; there
 * is no way to exceed it from the client.
 */
export type PlanName = "free" | "team" | "enterprise";

export type PlanLimits = {
  maxAgents: number;
  maxWorkflows: number;
  maxBridges: number;
  maxApiKeys: number;
  features: string[];
};

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    maxAgents: 3,
    maxWorkflows: 5,
    maxBridges: 1,
    maxApiKeys: 1,
    features: ["core"],
  },
  team: {
    maxAgents: 25,
    maxWorkflows: 100,
    maxBridges: 10,
    maxApiKeys: 10,
    features: ["core", "bridges", "api", "evals", "campaigns"],
  },
  enterprise: {
    maxAgents: 100_000,
    maxWorkflows: 100_000,
    maxBridges: 1_000,
    maxApiKeys: 1_000,
    features: [
      "core",
      "bridges",
      "api",
      "evals",
      "campaigns",
      "sso",
      "audit_export",
      "priority_support",
    ],
  },
};

export function planOf(scope: Scope): PlanName {
  const p = scope.space.plan;
  if (p === "team" || p === "enterprise") return p;
  return "free";
}

export function limitsOf(scope: Scope): PlanLimits {
  return PLAN_LIMITS[planOf(scope)];
}

export function hasFeature(scope: Scope, feature: string): boolean {
  return limitsOf(scope).features.includes(feature);
}

/** Throw a GuardViolation unless the plan includes a feature. */
export function assertFeature(scope: Scope, feature: string): void {
  if (!hasFeature(scope, feature)) {
    throw new GuardViolation(
      `${feature} requires a higher plan (current: ${planOf(scope)})`,
    );
  }
}

/**
 * Enforce a per-Space count limit (agents / workflows / bridges / apiKeys).
 * Counts existing rows via the by_space index and blocks the create that would
 * cross the ceiling. Bounded by .take(limit + 1) so the check is O(limit).
 */
export async function assertWithinPlanCount(
  ctx: MutationCtx,
  scope: Scope,
  table: "agents" | "workflows" | "bridges" | "apiKeys",
  limitKey: keyof PlanLimits,
): Promise<void> {
  const limit = limitsOf(scope)[limitKey] as number;
  const rows = await ctx.db
    .query(table)
    .withIndex("by_space", (q) => q.eq("spaceId", scope.spaceId))
    .take(limit + 1);
  if (rows.length >= limit) {
    throw new GuardViolation(
      `${table} limit reached for the ${planOf(scope)} plan (${limit}); upgrade to add more`,
    );
  }
}
