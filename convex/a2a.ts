import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import { getOwnerId } from "./lib/auth";

// ---------------------------------------------------------------------------
// Agent Cards — A2A discovery. We derive a card from each registered agent so
// agents (and the dashboard) can discover who's reachable and what they do.
// ---------------------------------------------------------------------------

function agentCard(agent: Doc<"agents">) {
  return {
    id: agent._id,
    name: agent.name,
    description: agent.description ?? "",
    platform: agent.platform ?? null,
    status: agent.status,
    // A2A "skills" — derived from the capabilities the connector reports.
    skills: (agent.capabilities ?? []).map((c) => ({
      id: c,
      name: c,
      description: `Capability: ${c}`,
    })),
    online: agent.status === "online",
  };
}

/** The directory of Agent Cards for this account (dashboard + discovery). */
export const directory = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getOwnerId(ctx);
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    return agents.map(agentCard);
  },
});

/** Recent inter-agent messages, with sender/recipient names resolved. */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const ownerId = await getOwnerId(ctx);
    const rows = await ctx.db
      .query("a2aMessages")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", ownerId))
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

/** Send a message from one agent to another, orchestrated from the dashboard. */
export const send = mutation({
  args: {
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
  handler: async (ctx, { fromAgentId, toAgentId, content, kind }) => {
    const ownerId = await getOwnerId(ctx);
    const from = await ctx.db.get(fromAgentId);
    const to = await ctx.db.get(toAgentId);
    if (!from || from.ownerId !== ownerId) throw new Error("Sender not found");
    if (!to || to.ownerId !== ownerId) throw new Error("Recipient not found");
    return await route(ctx, {
      ownerId,
      from,
      to,
      content,
      kind: kind ?? "message",
    });
  },
});

// ---------------------------------------------------------------------------
// Routing + delivery (shared by dashboard send and connector HTTP gateway)
// ---------------------------------------------------------------------------

type Ctx = { db: any };

/**
 * Route a message between two agents: ensure a shared thread, persist the A2A
 * message (queued for the recipient to pull), mirror it into the thread so the
 * conversation is visible, and emit an activity event.
 */
async function route(
  ctx: Ctx,
  args: {
    ownerId: string;
    from: Doc<"agents">;
    to: Doc<"agents">;
    content: string;
    kind: "message" | "task" | "status" | "artifact";
  },
): Promise<Id<"a2aMessages">> {
  const { ownerId, from, to, content, kind } = args;
  const now = Date.now();

  // Canonical pair key so A↔B always share one thread, attached to the
  // recipient agent for the threads "by_connector_key" index.
  const pair = [from._id, to._id].sort().join(":");
  const connectorKey = `a2a:${pair}`;
  let thread = await ctx.db
    .query("threads")
    .withIndex("by_connector_key", (q: any) =>
      q.eq("agentId", to._id).eq("connectorKey", connectorKey),
    )
    .unique();
  let threadId: Id<"threads">;
  if (thread) {
    threadId = thread._id;
    await ctx.db.patch(threadId, {
      lastMessageAt: now,
      messageCount: (thread.messageCount ?? 0) + 1,
    });
  } else {
    threadId = await ctx.db.insert("threads", {
      ownerId,
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
    ownerId,
    fromAgentId: from._id,
    toAgentId: to._id,
    threadId,
    kind,
    content,
    status: "queued",
    createdAt: now,
  });

  // Mirror into the thread transcript (prefix with the sender for clarity).
  await ctx.db.insert("messages", {
    ownerId,
    threadId,
    agentId: from._id,
    role: "assistant",
    content: `[${from.name} → ${to.name}] ${content}`,
    createdAt: now,
  });

  await ctx.db.insert("activity", {
    ownerId,
    agentId: from._id,
    threadId,
    type: "a2a",
    title: `${from.name} → ${to.name}`,
    detail: content.slice(0, 140) + (content.length > 140 ? "…" : ""),
    createdAt: now,
  });

  return messageId;
}

// --- connector gateway internals --------------------------------------------

/** Resolve a routing target by agent id or by name, scoped to the owner. */
export const resolveTarget = internalQuery({
  args: { ownerId: v.string(), ref: v.string() },
  handler: async (ctx, { ownerId, ref }) => {
    // Try as an id first.
    const all = await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
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
    ownerId: v.string(),
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
  handler: async (ctx, { ownerId, fromAgentId, toAgentId, content, kind }) => {
    const from = await ctx.db.get(fromAgentId);
    const to = await ctx.db.get(toAgentId);
    if (!from || !to) throw new Error("Agent not found");
    return await route(ctx, { ownerId, from, to, content, kind });
  },
});

/** The recipient's inbox: pull queued messages and mark them delivered. */
export const pullInbox = internalMutation({
  args: { agentId: v.id("agents"), limit: v.optional(v.number()) },
  handler: async (ctx, { agentId, limit }) => {
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
  },
});

export const directoryForOwner = internalQuery({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    return agents.map(agentCard);
  },
});
