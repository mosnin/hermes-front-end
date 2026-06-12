import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { Scope } from "./auth";
import { DEFAULT_GUARD_CONFIG } from "../schema";

/**
 * Guard violations are thrown with this prefix so callers (and the connector
 * gateway) can distinguish "blocked by policy" from genuine errors.
 */
export class GuardViolation extends Error {
  constructor(message: string) {
    super(`GuardViolation: ${message}`);
    this.name = "GuardViolation";
  }
}

function guards(scope: Scope) {
  return scope.space.guardConfig ?? DEFAULT_GUARD_CONFIG;
}

/** The master kill switch — refuse all autonomous dispatch when paused. */
export function assertAutonomyActive(scope: Scope): void {
  if (scope.space.autonomyPaused) {
    throw new GuardViolation("autonomy is paused (kill switch engaged)");
  }
}

/** Daily message/A2A budget — protects against runaway spend and chatter. */
export async function assertWithinDailyBudget(
  ctx: MutationCtx,
  scope: Scope,
): Promise<void> {
  const budget = guards(scope).dailyMessageBudget;
  const since = Date.now() - 24 * 60 * 60 * 1000;
  // Count A2A messages in the Space over the last 24h (indexed scan, bounded).
  const recent = await ctx.db
    .query("a2aMessages")
    .withIndex("by_space_time", (q) =>
      q.eq("spaceId", scope.spaceId).gte("createdAt", since),
    )
    .collect();
  if (recent.length >= budget) {
    throw new GuardViolation(
      `daily message budget reached (${budget}); autonomy throttled`,
    );
  }
}

/**
 * Loop detection — if the same sender→recipient pair has repeated effectively
 * identical messages within a short window, we're in a runaway loop.
 */
export async function assertNotLooping(
  ctx: MutationCtx,
  scope: Scope,
  fromAgentId: Id<"agents">,
  toAgentId: Id<"agents">,
  content: string,
): Promise<void> {
  const maxRepeats = guards(scope).maxLoopRepeats;
  const since = Date.now() - 60 * 1000; // 1 minute window
  const recent = await ctx.db
    .query("a2aMessages")
    .withIndex("by_space_time", (q) =>
      q.eq("spaceId", scope.spaceId).gte("createdAt", since),
    )
    .collect();
  const norm = content.trim().toLowerCase().slice(0, 200);
  const repeats = recent.filter(
    (m) =>
      m.fromAgentId === fromAgentId &&
      m.toAgentId === toAgentId &&
      m.content.trim().toLowerCase().slice(0, 200) === norm,
  ).length;
  if (repeats >= maxRepeats) {
    throw new GuardViolation(
      `loop detected: identical message repeated ${repeats}x in 60s`,
    );
  }
}

/** Per-run runaway guards: too many hops or steps, or wall-clock exceeded. */
export function assertRunWithinLimits(
  scope: Scope,
  run: { hops: number; stepsDone: number; startedAt: number },
): void {
  const g = guards(scope);
  if (run.hops >= g.maxAgentHops) {
    throw new GuardViolation(`max agent hops reached (${g.maxAgentHops})`);
  }
  if (run.stepsDone >= g.maxStepsPerRun) {
    throw new GuardViolation(`max steps per run reached (${g.maxStepsPerRun})`);
  }
  if (Date.now() - run.startedAt > g.maxRunWallclockMs) {
    throw new GuardViolation("run wall-clock limit exceeded");
  }
}
