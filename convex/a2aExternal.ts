import { v } from "convex/values";
import {
  action,
  internalAction,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { GuardViolation } from "./lib/guards";
import { recordWorkEvent, recordActivity } from "./lib/events";

// ===========================================================================
// Outbound — our agents call an external A2A agent (Agent2Agent over JSON-RPC)
// ===========================================================================

function extractReply(result: unknown): string {
  const r = result as {
    kind?: string;
    parts?: { kind?: string; text?: string }[];
    status?: { message?: { parts?: { kind?: string; text?: string }[] } };
  };
  const parts =
    r?.parts ?? r?.status?.message?.parts ?? ([] as { text?: string }[]);
  const text = parts
    .map((p) => p.text)
    .filter(Boolean)
    .join("\n");
  return text || JSON.stringify(result).slice(0, 500);
}

/** Perform the A2A message/send call against an external agent's card URL. */
async function callA2A(cardUrl: string, text: string): Promise<string> {
  const cardRes = await fetch(cardUrl, { method: "GET" });
  if (!cardRes.ok) throw new Error(`agent card fetch failed (${cardRes.status})`);
  const card = (await cardRes.json()) as { url?: string };
  const rpcUrl = card.url ?? cardUrl;
  const payload = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "message/send",
    params: {
      message: {
        role: "user",
        parts: [{ kind: "text", text }],
        messageId: crypto.randomUUID(),
        kind: "message",
      },
    },
  };
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (data.error) throw new Error(`A2A error: ${data.error.message}`);
  return extractReply(data.result);
}

export const prepareOutbound = internalQuery({
  args: {
    spaceId: v.id("spaces"),
    toAgentId: v.id("agents"),
  },
  handler: async (ctx, { spaceId, toAgentId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    if (scope.space.autonomyPaused) {
      throw new GuardViolation("autonomy is paused (kill switch engaged)");
    }
    const to = await ctx.db.get(toAgentId);
    if (!to || to.spaceId !== spaceId) throw new Error("Agent not found");
    if (to.kind !== "a2a-external" || !to.cardUrl) {
      throw new Error("Target is not an external A2A agent");
    }
    return { cardUrl: to.cardUrl, toName: to.name };
  },
});

/** Dashboard-initiated call to an external A2A agent. */
export const send = action({
  args: {
    spaceId: v.id("spaces"),
    fromAgentId: v.optional(v.id("agents")),
    toAgentId: v.id("agents"),
    text: v.string(),
  },
  handler: async (ctx, { spaceId, fromAgentId, toAgentId, text }) => {
    const prep = await ctx.runQuery(internal.a2aExternal.prepareOutbound, {
      spaceId,
      toAgentId,
    });
    const reply = await callA2A(prep.cardUrl, text);
    await ctx.runMutation(internal.a2aExternal.recordExchange, {
      spaceId,
      fromAgentId,
      toAgentId,
      sent: text,
      reply,
    });
    return { reply };
  },
});

/** Broker-initiated delivery (no user identity) — used when routing to an
 * external A2A recipient. */
export const deliver = internalAction({
  args: {
    spaceId: v.id("spaces"),
    fromAgentId: v.id("agents"),
    toAgentId: v.id("agents"),
    cardUrl: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { spaceId, fromAgentId, toAgentId, cardUrl, text }) => {
    try {
      const reply = await callA2A(cardUrl, text);
      await ctx.runMutation(internal.a2aExternal.recordExchange, {
        spaceId,
        fromAgentId,
        toAgentId,
        sent: text,
        reply,
      });
    } catch (e) {
      await ctx.runMutation(internal.a2aExternal.recordExchange, {
        spaceId,
        fromAgentId,
        toAgentId,
        sent: text,
        reply: `⚠ delivery failed: ${e instanceof Error ? e.message : e}`,
        failed: true,
      });
    }
  },
});

export const recordExchange = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    fromAgentId: v.optional(v.id("agents")),
    toAgentId: v.id("agents"),
    sent: v.string(),
    reply: v.string(),
    failed: v.optional(v.boolean()),
  },
  handler: async (ctx, { spaceId, fromAgentId, toAgentId, reply, failed }) => {
    const space = await ctx.db.get(spaceId);
    if (!space) return;
    const to = await ctx.db.get(toAgentId);
    const connectorKey = `a2a:ext:${toAgentId}`;
    const existing = await ctx.db
      .query("threads")
      .withIndex("by_connector_key", (q) =>
        q.eq("agentId", toAgentId).eq("connectorKey", connectorKey),
      )
      .unique();
    const now = Date.now();
    const threadId =
      existing?._id ??
      (await ctx.db.insert("threads", {
        companyId: space.companyId,
        spaceId,
        agentId: toAgentId,
        connectorKey,
        title: `External A2A: ${to?.name ?? "agent"}`,
        status: "active",
        messageCount: 0,
        createdAt: now,
        lastMessageAt: now,
      }));
    await ctx.db.insert("messages", {
      companyId: space.companyId,
      spaceId,
      threadId,
      agentId: toAgentId,
      role: "assistant",
      content: `↩ ${reply}`,
      createdAt: now,
    });
    await recordActivity(ctx, {
      companyId: space.companyId,
      spaceId,
      agentId: fromAgentId,
      threadId,
      type: failed ? "error" : "a2a",
      title: `External A2A → ${to?.name ?? "agent"}`,
      detail: reply.slice(0, 140),
    });
    await recordWorkEvent(ctx, {
      companyId: space.companyId,
      spaceId,
      actorType: "agent",
      agentId: fromAgentId,
      category: "a2a",
      action: failed ? "external_failed" : "external_reply",
      summary: `External A2A ${to?.name ?? "agent"}: ${reply.slice(0, 120)}`,
    });
  },
});

// ===========================================================================
// Inbound — external A2A clients call one of our agents (JSON-RPC message/send)
// ===========================================================================

export const ingestInbound = internalMutation({
  args: {
    agentId: v.id("agents"),
    fromLabel: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { agentId, fromLabel, text }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent) throw new Error("Agent not found");
    const connectorKey = "a2a:inbound";
    const existing = await ctx.db
      .query("threads")
      .withIndex("by_connector_key", (q) =>
        q.eq("agentId", agentId).eq("connectorKey", connectorKey),
      )
      .unique();
    const now = Date.now();
    const threadId =
      existing?._id ??
      (await ctx.db.insert("threads", {
        companyId: agent.companyId,
        spaceId: agent.spaceId,
        agentId,
        connectorKey,
        title: `Inbound A2A → ${agent.name}`,
        status: "active",
        messageCount: 0,
        createdAt: now,
        lastMessageAt: now,
      }));
    const messageId = await ctx.db.insert("messages", {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      threadId,
      agentId,
      role: "user",
      content: `[${fromLabel}] ${text}`,
      createdAt: now,
    });
    await recordActivity(ctx, {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      agentId,
      threadId,
      type: "a2a",
      title: `Inbound A2A from ${fromLabel}`,
      detail: text.slice(0, 140),
    });
    await recordWorkEvent(ctx, {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      actorType: "agent",
      agentId,
      category: "a2a",
      action: "inbound_received",
      summary: `Inbound A2A from ${fromLabel}: ${text.slice(0, 120)}`,
    });
    return { taskId: messageId, contextId: threadId };
  },
});

export const inboundTask = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const msg = await ctx.db.get(messageId);
    if (!msg) return null;
    return { id: messageId, contextId: msg.threadId, state: "working" as const };
  },
});
