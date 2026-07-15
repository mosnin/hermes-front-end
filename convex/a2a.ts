import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";
import { resolveScope, requireRole, Scope } from "./lib/auth";
import {
  assertAutonomyActive,
  assertWithinDailyBudget,
  assertNotLooping,
  assertRateLimit,
  assertWithinBudget,
  assertPlatformActive,
  recordA2ASend,
  GuardViolation,
} from "./lib/guards";
import { recordWorkEvent } from "./lib/events";
import { recordUsage } from "./lib/metering";

function agentCard(agent: Doc<"agents">) {
  return {
    id: agent._id,
    name: agent.name,
    description: agent.description ?? "",
    platform: agent.platform ?? null,
    kind: agent.kind ?? "hermes",
    status: agent.status,
    cardUrl: agent.cardUrl ?? null,
    skills: (agent.capabilities ?? []).map((c) => ({
      id: c,
      name: c,
      description: `Capability: ${c}`,
    })),
    online: agent.status === "online",
  };
}

export const directory = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return agents.map(agentCard);
  },
});

export const recent = query({
  args: { spaceId: v.id("spaces"), limit: v.optional(v.number()) },
  handler: async (ctx, { spaceId, limit }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("a2aMessages")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(limit ?? 100);
    const names = new Map<string, string>();
    const nameOf = async (id: Id<"agents">) => {
      const hit = names.get(id);
      if (hit) return hit;
      const a = await ctx.db.get(id);
      const n = a?.name ?? "unknown";
      names.set(id, n);
      return n;
    };
    return await Promise.all(
      rows.map(async (m) => ({
        ...m,
        fromName: await nameOf(m.fromAgentId),
        toName: await nameOf(m.toAgentId),
      })),
    );
  },
});

/** Send a message between two agents (dashboard-orchestrated). Guarded. */
export const send = mutation({
  args: {
    spaceId: v.id("spaces"),
    fromAgentId: v.id("agents"),
    toAgentId: v.id("agents"),
    content: v.string(),
    kind: v.optional(
      v.union(
        v.literal("message"),
        v.literal("task"),
        v.literal("status"),
        v.literal("artifact"),
      ),
    ),
  },
  handler: async (ctx, { spaceId, fromAgentId, toAgentId, content, kind }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const from = await ctx.db.get(fromAgentId);
    const to = await ctx.db.get(toAgentId);
    if (!from || from.spaceId !== spaceId) throw new Error("Sender not found");
    if (!to || to.spaceId !== spaceId) throw new Error("Recipient not found");
    // NB: error capture for a thrown guard happens at the gateway (httpAction),
    // not here — a mutation that throws rolls back all its writes, so recording
    // inside this transaction would vanish with it.
    await runGuards(ctx, scope, fromAgentId, toAgentId, content);
    return await route(ctx, { scope, from, to, content, kind: kind ?? "message" });
  },
});

// ---------------------------------------------------------------------------
// Guards + routing
// ---------------------------------------------------------------------------

async function runGuards(
  ctx: MutationCtx,
  scope: Scope,
  fromAgentId: Id<"agents">,
  toAgentId: Id<"agents">,
  content: string,
): Promise<void> {
  await assertPlatformActive(ctx);
  assertAutonomyActive(scope);
  // Shadow mode: log the action as a proposal and block execution.
  if (scope.space.shadowMode) {
    await ctx.db.insert("actionLedger", {
      companyId: scope.companyId,
      spaceId: scope.spaceId,
      agentId: fromAgentId,
      action: "a2a_send",
      target: toAgentId,
      status: "proposed",
      reversible: false,
      payload: { content: content.slice(0, 500) },
      createdAt: Date.now(),
    });
    throw new GuardViolation(
      "shadow mode — action proposed to the ledger, not executed",
    );
  }
  await assertWithinBudget(ctx, scope);
  await assertRateLimit(ctx, scope);
  await assertWithinDailyBudget(ctx, scope);
  await assertNotLooping(ctx, scope, fromAgentId, toAgentId, content);
}

async function route(
  ctx: MutationCtx,
  args: {
    scope: Scope;
    from: Doc<"agents">;
    to: Doc<"agents">;
    content: string;
    kind: "message" | "task" | "status" | "artifact";
  },
): Promise<Id<"a2aMessages">> {
  const { scope, from, to, content, kind } = args;
  const { companyId, spaceId } = scope;
  const now = Date.now();

  const pair = [from._id, to._id].sort().join(":");
  const connectorKey = `a2a:${pair}`;
  const existing = await ctx.db
    .query("threads")
    .withIndex("by_connector_key", (q) =>
      q.eq("agentId", to._id).eq("connectorKey", connectorKey),
    )
    .unique();
  let threadId: Id<"threads">;
  if (existing) {
    threadId = existing._id;
    await ctx.db.patch(threadId, {
      lastMessageAt: now,
      messageCount: (existing.messageCount ?? 0) + 1,
    });
  } else {
    threadId = await ctx.db.insert("threads", {
      companyId,
      spaceId,
      agentId: to._id,
      connectorKey,
      title: `${from.name} ↔ ${to.name}`,
      status: "active",
      messageCount: 1,
      createdAt: now,
      lastMessageAt: now,
    });
  }

  const messageId = await ctx.db.insert("a2aMessages", {
    companyId,
    spaceId,
    fromAgentId: from._id,
    toAgentId: to._id,
    threadId,
    kind,
    content,
    status: "queued",
    createdAt: now,
  });

  await ctx.db.insert("messages", {
    companyId,
    spaceId,
    threadId,
    agentId: from._id,
    role: "assistant",
    content: `[${from.name} → ${to.name}] ${content}`,
    createdAt: now,
  });

  await ctx.db.insert("activity", {
    companyId,
    spaceId,
    agentId: from._id,
    threadId,
    type: "a2a",
    title: `${from.name} → ${to.name}`,
    detail: content.slice(0, 140) + (content.length > 140 ? "…" : ""),
    createdAt: now,
  });

  await recordWorkEvent(ctx, {
    companyId,
    spaceId,
    actorType: "agent",
    agentId: from._id,
    category: "a2a",
    action: "message_sent",
    summary: `${from.name} → ${to.name}: ${content.slice(0, 120)}`,
  });

  await recordUsage(ctx, {
    companyId,
    spaceId,
    agentId: from._id,
    kind: "message",
  });

  // O(1) counters that back the rate/daily/loop guards on the next send.
  await recordA2ASend(ctx, scope, from._id, to._id, content);

  // If the recipient is an external A2A agent, actually call it over the
  // protocol (the internal queue/inbox only serves our own Hermes agents).
  if (to.kind === "a2a-external" && to.cardUrl) {
    await ctx.scheduler.runAfter(0, internal.a2aExternal.deliver, {
      spaceId,
      fromAgentId: from._id,
      toAgentId: to._id,
      cardUrl: to.cardUrl,
      text: content,
    });
  }

  return messageId;
}

// --- connector gateway internals (token-authenticated) ----------------------

/** Build a guard scope from a Space doc when there is no user identity. */
async function connectorScope(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
): Promise<Scope> {
  const space = await ctx.db.get(spaceId);
  if (!space) throw new Error("Space not found");
  return {
    userId: "connector",
    companyId: space.companyId,
    spaceId,
    space,
    role: "operator",
  };
}

export const resolveTarget = internalQuery({
  args: { spaceId: v.id("spaces"), ref: v.string() },
  handler: async (ctx, { spaceId, ref }) => {
    const all = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return (
      all.find((a) => a._id === ref) ??
      all.find((a) => a.name.toLowerCase() === ref.toLowerCase()) ??
      null
    );
  },
});

export const routeFromConnector = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    fromAgentId: v.id("agents"),
    toAgentId: v.id("agents"),
    content: v.string(),
    kind: v.union(
      v.literal("message"),
      v.literal("task"),
      v.literal("status"),
      v.literal("artifact"),
    ),
  },
  handler: async (ctx, { spaceId, fromAgentId, toAgentId, content, kind }) => {
    const scope = await connectorScope(ctx, spaceId);
    const from = await ctx.db.get(fromAgentId);
    const to = await ctx.db.get(toAgentId);
    if (!from || from.spaceId !== spaceId) throw new Error("Sender not in space");
    if (!to || to.spaceId !== spaceId) throw new Error("Recipient not in space");
    // Guards apply equally to connector-originated (autonomous) traffic.
    await runGuards(ctx, scope, fromAgentId, toAgentId, content);
    return await route(ctx, { scope, from, to, content, kind });
  },
});

/** Pull queued inbox messages for an agent (marks them delivered). Shared by
 * the poll endpoint, the SSE stream, and the combined long-poll. */
export async function pullInboxFor(
  ctx: MutationCtx,
  agentId: Id<"agents">,
  limit?: number,
) {
  const pending = await ctx.db
    .query("a2aMessages")
    .withIndex("by_recipient_status", (q) =>
      q.eq("toAgentId", agentId).eq("status", "queued"),
    )
    .order("asc")
    .take(limit ?? 50);
  const now = Date.now();
  const out = [];
  for (const m of pending) {
    await ctx.db.patch(m._id, { status: "delivered", deliveredAt: now });
    const from = await ctx.db.get(m.fromAgentId);
    out.push({
      id: m._id,
      from: { id: m.fromAgentId, name: from?.name ?? "unknown" },
      kind: m.kind,
      content: m.content,
      payload: m.payload,
      createdAt: m.createdAt,
    });
  }
  return out;
}

export const pullInbox = internalMutation({
  args: { agentId: v.id("agents"), limit: v.optional(v.number()) },
  handler: async (ctx, { agentId, limit }) => pullInboxFor(ctx, agentId, limit),
});

/**
 * Recipient confirms it processed messages (at-least-once delivery). Only the
 * addressee can ack, and only delivered messages transition — so a hostile or
 * confused connector can't ack someone else's queue.
 */
export const ackMessages = internalMutation({
  args: { agentId: v.id("agents"), ids: v.array(v.id("a2aMessages")) },
  handler: async (ctx, { agentId, ids }) => {
    let acked = 0;
    const now = Date.now();
    for (const id of ids.slice(0, 100)) {
      const m = await ctx.db.get(id);
      if (m && m.toAgentId === agentId && m.status === "delivered") {
        await ctx.db.patch(id, { status: "acked", ackedAt: now });
        acked++;
      }
    }
    return { acked };
  },
});

const REDELIVERY_WINDOW_MS = 2 * 60 * 1000; // unacked after 2m → requeue
const MAX_REDELIVERIES = 5;

/**
 * Redelivery sweep (cron): a message claimed by the transport but never acked
 * (dropped connection, crashed handler) goes back to "queued" so the next pull
 * sees it again. After MAX_REDELIVERIES it's expired + dead-lettered instead of
 * looping forever. Bounded by .take() so the sweep is O(batch).
 */
export const redeliverUnacked = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - REDELIVERY_WINDOW_MS;
    const stale = await ctx.db
      .query("a2aMessages")
      .withIndex("by_status_delivered", (q) =>
        q.eq("status", "delivered").lt("deliveredAt", cutoff),
      )
      .take(100);
    let requeued = 0;
    let expired = 0;
    for (const m of stale) {
      const tries = (m.redeliveries ?? 0) + 1;
      if (tries > MAX_REDELIVERIES) {
        await ctx.db.patch(m._id, { status: "expired" });
        await ctx.db.insert("deadLetters", {
          companyId: m.companyId,
          spaceId: m.spaceId,
          kind: "a2a_message",
          agentId: m.toAgentId,
          error: `A2A message never acked after ${MAX_REDELIVERIES} redeliveries`,
          attempts: MAX_REDELIVERIES,
          payload: { content: m.content.slice(0, 500), from: m.fromAgentId },
          status: "open",
          createdAt: Date.now(),
        });
        expired++;
      } else {
        await ctx.db.patch(m._id, {
          status: "queued",
          redeliveries: tries,
        });
        requeued++;
      }
    }
    return { scanned: stale.length, requeued, expired };
  },
});

export const directoryForSpace = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return agents.map(agentCard);
  },
});
