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

const MSG_ROLE = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("system"),
  v.literal("tool"),
);

/**
 * Atomically ingest a connector message: idempotency check + thread upsert +
 * message insert + activity, all in ONE transaction. This is the correct home
 * for the idempotency key — recording it in a separate mutation before the
 * write (the earlier design) meant a failure after the key committed would drop
 * the message permanently while the client saw success. Here, if anything
 * throws the whole transaction (key included) rolls back, so a retry
 * re-processes cleanly and a true duplicate is dropped.
 */
export const ingestMessage = internalMutation({
  args: {
    agentId: v.id("agents"),
    companyId: v.string(),
    spaceId: v.id("spaces"),
    connectorKey: v.string(),
    threadTitle: v.string(),
    role: MSG_ROLE,
    content: v.string(),
    toolCalls: v.optional(v.any()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const first = await firstSeen(ctx, args.agentId, args.idempotencyKey);
    if (!first) return { deduped: true, threadId: null };

    const now = Date.now();
    const existing = await ctx.db
      .query("threads")
      .withIndex("by_connector_key", (q) =>
        q.eq("agentId", args.agentId).eq("connectorKey", args.connectorKey),
      )
      .unique();
    let threadId;
    if (existing) {
      threadId = existing._id;
      await ctx.db.patch(threadId, {
        lastMessageAt: now,
        messageCount: (existing.messageCount ?? 0) + 1,
      });
    } else {
      threadId = await ctx.db.insert("threads", {
        companyId: args.companyId,
        spaceId: args.spaceId,
        agentId: args.agentId,
        connectorKey: args.connectorKey,
        title: args.threadTitle,
        status: "active",
        messageCount: 1,
        createdAt: now,
        lastMessageAt: now,
      });
    }

    await ctx.db.insert("messages", {
      companyId: args.companyId,
      spaceId: args.spaceId,
      threadId,
      agentId: args.agentId,
      role: args.role,
      content: args.content,
      toolCalls: args.toolCalls,
      createdAt: now,
    });

    const detail =
      args.content.slice(0, 140) + (args.content.length > 140 ? "…" : "");
    await ctx.db.insert("activity", {
      companyId: args.companyId,
      spaceId: args.spaceId,
      agentId: args.agentId,
      threadId,
      type: "message",
      title: `${args.role} message`,
      detail,
      createdAt: now,
    });

    return { deduped: false, threadId };
  },
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
