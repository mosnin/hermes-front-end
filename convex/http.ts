import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sha256Hex } from "./lib/crypto";
import { Doc } from "./_generated/dataModel";

const http = httpRouter();

/**
 * Authenticate a connector request by its Bearer token. The connector sends the
 * raw token it was given at registration; we hash it and look up the agent.
 */
async function authAgent(
  ctx: { runQuery: any },
  request: Request,
): Promise<Doc<"agents"> | null> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  return await ctx.runQuery(internal.agents.byTokenHash, { tokenHash });
}

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

// POST /connector/register — connector announces itself and goes online.
http.route({
  path: "/connector/register",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    await ctx.runMutation(internal.agents.recordHeartbeat, {
      agentId: agent._id,
      status: "online",
      connectorVersion: body.connectorVersion,
      capabilities: body.capabilities,
      meta: body.meta,
    });
    await ctx.runMutation(internal.activity.append, {
      ownerId: agent.ownerId,
      agentId: agent._id,
      type: "system",
      title: `${agent.name} connected`,
      detail: body.platform ? `Running on ${body.platform}` : undefined,
    });
    return Response.json({ ok: true, agentId: agent._id, name: agent.name });
  }),
});

// POST /connector/heartbeat — periodic liveness ping.
http.route({
  path: "/connector/heartbeat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    await ctx.runMutation(internal.agents.recordHeartbeat, {
      agentId: agent._id,
      status: body.status ?? "online",
      meta: body.meta,
    });
    return Response.json({ ok: true });
  }),
});

// POST /connector/activity — append an activity event (tool calls, status, ...).
http.route({
  path: "/connector/activity",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));

    let threadId: string | undefined;
    if (body.threadKey) {
      threadId = await ctx.runMutation(internal.threads.upsertFromConnector, {
        ownerId: agent.ownerId,
        agentId: agent._id,
        connectorKey: String(body.threadKey),
        title: body.threadTitle ?? "Untitled thread",
      });
    }

    await ctx.runMutation(internal.activity.append, {
      ownerId: agent.ownerId,
      agentId: agent._id,
      threadId: threadId as any,
      type: body.type ?? "system",
      title: body.title ?? "Activity",
      detail: body.detail,
      payload: body.payload,
    });
    return Response.json({ ok: true });
  }),
});

// POST /connector/message — relay a conversation turn into a thread.
http.route({
  path: "/connector/message",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    if (!body.threadKey || !body.content) {
      return new Response(
        JSON.stringify({ error: "threadKey and content required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const threadId = await ctx.runMutation(
      internal.threads.upsertFromConnector,
      {
        ownerId: agent.ownerId,
        agentId: agent._id,
        connectorKey: String(body.threadKey),
        title: body.threadTitle ?? "Untitled thread",
      },
    );

    await ctx.runMutation(internal.messages.appendFromConnector, {
      ownerId: agent.ownerId,
      threadId,
      agentId: agent._id,
      role: body.role ?? "assistant",
      content: String(body.content),
      toolCalls: body.toolCalls,
    });

    await ctx.runMutation(internal.activity.append, {
      ownerId: agent.ownerId,
      agentId: agent._id,
      threadId,
      type: "message",
      title: `${body.role ?? "assistant"} message`,
      detail:
        String(body.content).slice(0, 140) +
        (String(body.content).length > 140 ? "…" : ""),
    });
    return Response.json({ ok: true, threadId });
  }),
});

// ---------------------------------------------------------------------------
// A2A gateway — agent-to-agent messaging brokered through the control plane.
// ---------------------------------------------------------------------------

// POST /a2a/discover — list Agent Cards the caller can talk to.
http.route({
  path: "/a2a/discover",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const cards = await ctx.runQuery(internal.a2a.directoryForOwner, {
      ownerId: agent.ownerId,
    });
    // Don't include the caller in its own discovery list.
    return Response.json({
      self: { id: agent._id, name: agent.name },
      agents: cards.filter((c: { id: string }) => c.id !== agent._id),
    });
  }),
});

// POST /a2a/send — send a message to another agent (by id or name).
http.route({
  path: "/a2a/send",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    if (!body.to || !body.content) {
      return new Response(
        JSON.stringify({ error: "to and content required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const target = await ctx.runQuery(internal.a2a.resolveTarget, {
      ownerId: agent.ownerId,
      ref: String(body.to),
    });
    if (!target) {
      return new Response(JSON.stringify({ error: "recipient not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const messageId = await ctx.runMutation(internal.a2a.routeFromConnector, {
      ownerId: agent.ownerId,
      fromAgentId: agent._id,
      toAgentId: target._id,
      content: String(body.content),
      kind: body.kind ?? "message",
    });
    return Response.json({ ok: true, messageId, to: target._id });
  }),
});

// POST /a2a/inbox — pull queued messages addressed to the caller. The connector
// polls this (or holds it open) to receive peer messages in near real time.
http.route({
  path: "/a2a/inbox",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    const messages = await ctx.runMutation(internal.a2a.pullInbox, {
      agentId: agent._id,
      limit: body.limit,
    });
    return Response.json({ ok: true, messages });
  }),
});

export default http;
