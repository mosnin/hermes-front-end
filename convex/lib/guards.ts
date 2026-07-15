import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { Scope } from "./auth";
import { DEFAULT_GUARD_CONFIG } from "../schema";
import { withinSchedule } from "./schedule";
import {
  bumpCounter,
  readCounter,
  monthBucket,
  minuteBucket,
  dayBucket,
  loopHash,
} from "./counters";

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

/**
 * Scheduled active window — outside configured business hours, refuse new
 * autonomous dispatch. Evaluated at guard time (no cron); a disabled/absent
 * schedule is always active.
 */
export function assertWithinSchedule(scope: Scope): void {
  if (!withinSchedule(scope.space.schedule, Date.now())) {
    throw new GuardViolation("outside the Space's scheduled active hours");
  }
}

/**
 * Platform-wide kill switch. When a platform admin engages
 * `global_autonomy_paused`, no tenant may dispatch autonomous work. Checked at
 * the points where autonomous work is *initiated* (send, workflow start) — one
 * indexed read, not on every hot inner step.
 */
export async function assertPlatformActive(ctx: MutationCtx): Promise<void> {
  const flag = await ctx.db
    .query("platformFlags")
    .withIndex("by_key", (q) => q.eq("key", "global_autonomy_paused"))
    .unique();
  if (flag?.enabled) {
    throw new GuardViolation(
      "platform autonomy is paused by an administrator (global kill switch)",
    );
  }
}

/**
 * Daily message/A2A budget — protects against runaway spend and chatter.
 * Reads an O(1) per-day counter instead of scanning 24h of messages.
 */
export async function assertWithinDailyBudget(
  ctx: MutationCtx,
  scope: Scope,
): Promise<void> {
  const budget =
    guards(scope).dailyMessageBudget ?? DEFAULT_GUARD_CONFIG.dailyMessageBudget;
  const { count } = await readCounter(
    ctx,
    scope.spaceId,
    "a2a:day",
    dayBucket(),
  );
  if (count >= budget) {
    throw new GuardViolation(
      `daily message budget reached (${budget}); autonomy throttled`,
    );
  }
}

/**
 * Loop detection — if the same sender→recipient pair has repeated effectively
 * identical messages within a short window, we're in a runaway loop. Uses an
 * O(1) counter keyed by a hash of (from, to, normalized-content) in the current
 * minute bucket instead of scanning and filtering every recent message.
 */
export async function assertNotLooping(
  ctx: MutationCtx,
  scope: Scope,
  fromAgentId: Id<"agents">,
  toAgentId: Id<"agents">,
  content: string,
): Promise<void> {
  const maxRepeats =
    guards(scope).maxLoopRepeats ?? DEFAULT_GUARD_CONFIG.maxLoopRepeats;
  const key = loopHash(fromAgentId, toAgentId, content);
  const { count } = await readCounter(
    ctx,
    scope.spaceId,
    "loop",
    `${key}:${minuteBucket()}`,
  );
  if (count >= maxRepeats) {
    throw new GuardViolation(
      `loop detected: identical message repeated ${count}x in ~60s`,
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

/**
 * Rate limit: cap autonomous messages per minute to prevent bursts.
 * O(1) fixed-window counter read.
 */
export async function assertRateLimit(
  ctx: MutationCtx,
  scope: Scope,
): Promise<void> {
  const perMinute = guards(scope).maxMessagesPerMinute ?? 120;
  const { count } = await readCounter(
    ctx,
    scope.spaceId,
    "a2a:min",
    minuteBucket(),
  );
  if (count >= perMinute) {
    throw new GuardViolation(`rate limit: ${perMinute} messages/minute`);
  }
}

/**
 * Monthly spend budget: block (and pause) when exceeded. Reads the same O(1)
 * month accumulator that recordUsage maintains (scope "usage").
 */
export async function assertWithinBudget(
  ctx: MutationCtx,
  scope: Scope,
): Promise<void> {
  const budget = guards(scope).monthlyBudgetUsd ?? 0;
  if (budget <= 0) return;
  const { valueUsd } = await readCounter(
    ctx,
    scope.spaceId,
    "usage",
    monthBucket(),
  );
  if (valueUsd >= budget) {
    throw new GuardViolation(`monthly budget of $${budget} reached`);
  }
}

/**
 * Record that an A2A message was sent — bumps the per-minute (rate), per-day
 * (daily budget), and loop-detection counters in O(1). Call this in the send
 * path right after the message row is written, so the guards above see it on
 * the next attempt. `usage`/spend is handled separately by recordUsage.
 */
export async function recordA2ASend(
  ctx: MutationCtx,
  scope: Scope,
  fromAgentId: Id<"agents">,
  toAgentId: Id<"agents">,
  content: string,
): Promise<void> {
  const base = { companyId: scope.companyId, spaceId: scope.spaceId };
  await bumpCounter(ctx, { ...base, scope: "a2a:min", bucket: minuteBucket() });
  await bumpCounter(ctx, { ...base, scope: "a2a:day", bucket: dayBucket() });
  const key = loopHash(fromAgentId, toAgentId, content);
  await bumpCounter(ctx, {
    ...base,
    scope: "loop",
    bucket: `${key}:${minuteBucket()}`,
  });
}
