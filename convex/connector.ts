import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { claimStepsFor } from "./engine";
import { pullInboxFor } from "./a2a";
import { firstSeen } from "./lib/idempotency";

/**
 * Idempotency gate for retried connector ingestion. Returns true if this is the
 * first time we've seen (agent, key) — the caller should proceed — or false if
 * it's a duplicate that should be dropped.
 */
export const markIfFirst = internalMutation({
  args: { agentId: v.id("agents"), key: v.string() },
  handler: async (ctx, { agentId, key }) => firstSeen(ctx, agentId, key),
});

/**
 * Combined work pull for the real-time long-poll transport.
 *
 * The old connector busy-polled three endpoints on a ~2s timer: /workflow/inbox,
 * /a2a/inbox, and /connector/heartbeat. That's three Convex function calls every
 * couple of seconds per idle agent — ~96% of the platform's Convex cost and the
 * reason "always-on" agents were expensive.
 *
 * This single mutation claims dispatched workflow steps, drains the A2A inbox,
 * and refreshes the heartbeat in one call. The /connector/pull SSE endpoint
 * holds one connection open and ticks this, so an idle agent costs one held
 * request + a slow adaptive tick instead of a constant three-call storm — and
 * work is pushed to the agent with ~1s latency instead of up to 2s of polling.
 */
export const pullWork = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const steps = await claimStepsFor(ctx, agentId);
    const messages = await pullInboxFor(ctx, agentId, 25);
    // Heartbeat: keep the agent "online" for the health sweep without a
    // separate ping call.
    await ctx.db.patch(agentId, {
      status: "online",
      lastHeartbeat: Date.now(),
    });
    return { steps, messages };
  },
});
