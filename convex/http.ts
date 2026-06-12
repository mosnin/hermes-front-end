import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sha256Hex } from "./lib/crypto";
import { Doc } from "./_generated/dataModel";

const http = httpRouter();

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
const unauthorized = () => json({ error: "unauthorized" }, 401);

/** Map a thrown GuardViolation to HTTP 429, everything else to 500. */
function errorResponse(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.startsWith("GuardViolation:")) {
    return json({ error: "guard", detail: msg.replace("GuardViolation: ", "") }, 429);
  }
  return json({ error: "internal", detail: msg }, 500);
}

// --- connector lifecycle ----------------------------------------------------

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
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      agentId: agent._id,
      type: "system",
      title: `${agent.name} connected`,
      detail: body.platform ? `Running on ${body.platform}` : undefined,
    });
    return json({ ok: true, agentId: agent._id, name: agent.name });
  }),
});

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
    return json({ ok: true });
  }),
});

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
        companyId: agent.companyId,
        spaceId: agent.spaceId,
        agentId: agent._id,
        connectorKey: String(body.threadKey),
        title: body.threadTitle ?? "Untitled thread",
      });
    }
    await ctx.runMutation(internal.activity.append, {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      agentId: agent._id,
      threadId: threadId as any,
      type: body.type ?? "system",
      title: body.title ?? "Activity",
      detail: body.detail,
      payload: body.payload,
    });
    return json({ ok: true });
  }),
});

http.route({
  path: "/connector/message",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    if (!body.threadKey || !body.content) {
      return json({ error: "threadKey and content required" }, 400);
    }
    const threadId = await ctx.runMutation(
      internal.threads.upsertFromConnector,
      {
        companyId: agent.companyId,
        spaceId: agent.spaceId,
        agentId: agent._id,
        connectorKey: String(body.threadKey),
        title: body.threadTitle ?? "Untitled thread",
      },
    );
    await ctx.runMutation(internal.messages.appendFromConnector, {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      threadId,
      agentId: agent._id,
      role: body.role ?? "assistant",
      content: String(body.content),
      toolCalls: body.toolCalls,
    });
    await ctx.runMutation(internal.activity.append, {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      agentId: agent._id,
      threadId,
      type: "message",
      title: `${body.role ?? "assistant"} message`,
      detail:
        String(body.content).slice(0, 140) +
        (String(body.content).length > 140 ? "…" : ""),
    });
    return json({ ok: true, threadId });
  }),
});

// --- A2A gateway ------------------------------------------------------------

http.route({
  path: "/a2a/discover",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const cards = await ctx.runQuery(internal.a2a.directoryForSpace, {
      spaceId: agent.spaceId,
    });
    return json({
      self: { id: agent._id, name: agent.name },
      agents: cards.filter((c: { id: string }) => c.id !== agent._id),
    });
  }),
});

http.route({
  path: "/a2a/send",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    if (!body.to || !body.content) {
      return json({ error: "to and content required" }, 400);
    }
    const target = await ctx.runQuery(internal.a2a.resolveTarget, {
      spaceId: agent.spaceId,
      ref: String(body.to),
    });
    if (!target) return json({ error: "recipient not found" }, 404);
    try {
      const messageId = await ctx.runMutation(internal.a2a.routeFromConnector, {
        spaceId: agent.spaceId,
        fromAgentId: agent._id,
        toAgentId: target._id,
        content: String(body.content),
        kind: body.kind ?? "message",
      });
      return json({ ok: true, messageId, to: target._id });
    } catch (e) {
      return errorResponse(e);
    }
  }),
});

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
    return json({ ok: true, messages });
  }),
});

export default http;
