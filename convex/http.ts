import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sha256Hex } from "./lib/crypto";
import { Doc, Id } from "./_generated/dataModel";
import {
  buildAgentCard,
  buildTask,
  rpcError,
  rpcResult,
  textFromMessage,
} from "./a2aProtocol";

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

// --- workflow engine (connector executes dispatched steps) ------------------

// POST /workflow/inbox — claim steps dispatched to this agent.
http.route({
  path: "/workflow/inbox",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const steps = await ctx.runMutation(internal.engine.claimSteps, {
      agentId: agent._id,
    });
    return json({ ok: true, steps });
  }),
});

// POST /workflow/result — report the result of a step.
http.route({
  path: "/workflow/result",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    if (!body.runId || !body.stepId) {
      return json({ error: "runId and stepId required" }, 400);
    }
    const res = await ctx.runMutation(internal.engine.reportResult, {
      agentId: agent._id,
      runId: body.runId,
      stepId: String(body.stepId),
      ok: body.ok !== false,
      output: body.output,
    });
    return json(res);
  }),
});

// POST /trigger/run — fire a webhook trigger. Body: { triggerId, secret }.
http.route({
  path: "/trigger/run",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json().catch(() => ({}));
    if (!body.triggerId || !body.secret) {
      return json({ error: "triggerId and secret required" }, 400);
    }
    const trigger = await ctx.runQuery(internal.triggers.getForWebhook, {
      triggerId: body.triggerId,
    });
    if (
      !trigger ||
      trigger.kind !== "webhook" ||
      !trigger.enabled ||
      trigger.webhookSecret !== body.secret
    ) {
      return json({ error: "invalid trigger or secret" }, 403);
    }
    const runId = await ctx.runMutation(internal.workflows.startFromTrigger, {
      workflowId: trigger.workflowId,
      trigger: "webhook",
    });
    return json({ ok: true, runId });
  }),
});

// ===========================================================================
// A2A server — expose our agents to external A2A clients (spec-conformant)
// ===========================================================================

// Gateway-level Agent Card.
http.route({
  path: "/.well-known/agent-card.json",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const origin = new URL(request.url).origin;
    return json({
      protocolVersion: "0.3.0",
      name: "Hermes Control Plane",
      description:
        "A2A gateway. Each connected agent exposes its own card at /a2a/card/{agentId}.",
      url: origin,
      capabilities: { streaming: true },
      defaultInputModes: ["text/plain"],
      defaultOutputModes: ["text/plain"],
      skills: [],
    });
  }),
});

// GET /a2a/card/{agentId} — a spec-shaped Agent Card for one of our agents.
http.route({
  pathPrefix: "/a2a/card/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const agentId = url.pathname.slice("/a2a/card/".length);
    try {
      const agent = await ctx.runQuery(internal.agents.getForA2A, {
        agentId: agentId as Id<"agents">,
      });
      if (!agent) return json({ error: "not found" }, 404);
      return json(buildAgentCard(agent, `${url.origin}/a2a/rpc/${agentId}`));
    } catch {
      return json({ error: "invalid agent id" }, 400);
    }
  }),
});

// POST /a2a/rpc/{agentId} — JSON-RPC 2.0 endpoint (message/send, message/stream,
// tasks/get, tasks/cancel).
http.route({
  pathPrefix: "/a2a/rpc/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const agentId = url.pathname.slice("/a2a/rpc/".length);
    let agent: Doc<"agents"> | null;
    try {
      agent = await ctx.runQuery(internal.agents.getForA2A, {
        agentId: agentId as Id<"agents">,
      });
    } catch {
      return json(rpcError(null, -32600, "invalid agent id"), 400);
    }
    if (!agent) return json(rpcError(null, -32600, "unknown agent"), 404);

    // Inbound auth: if the agent has a key, require it; otherwise open.
    if (agent.a2aInboundKeyHash) {
      const header = request.headers.get("Authorization") ?? "";
      const provided = header.startsWith("Bearer ")
        ? header.slice(7).trim()
        : request.headers.get("X-A2A-Key") ?? "";
      const ok = provided && (await sha256Hex(provided)) === agent.a2aInboundKeyHash;
      if (!ok) return json(rpcError(null, -32001, "unauthorized"), 401);
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: unknown;
      method?: string;
      params?: any;
    };
    const { id, method, params } = body;

    if (method === "message/send" || method === "message/stream") {
      const text = textFromMessage(params?.message);
      const fromLabel = params?.metadata?.from ?? "external-a2a";
      const task = await ctx.runMutation(internal.a2aExternal.ingestInbound, {
        agentId: agent._id,
        fromLabel: String(fromLabel),
        text,
      });
      const taskObj = buildTask(task.taskId, task.contextId, "working");

      if (method === "message/stream") {
        // SSE: emit the submitted + working states, then close.
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              enc.encode(
                `data: ${JSON.stringify(rpcResult(id, buildTask(task.taskId, task.contextId, "submitted")))}\n\n`,
              ),
            );
            controller.enqueue(
              enc.encode(`data: ${JSON.stringify(rpcResult(id, taskObj))}\n\n`),
            );
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
      return json(rpcResult(id, taskObj));
    }

    if (method === "tasks/get") {
      try {
        const t = await ctx.runQuery(internal.a2aExternal.inboundTask, {
          messageId: params?.id as Id<"messages">,
        });
        if (!t) return json(rpcError(id, -32001, "task not found"), 404);
        return json(rpcResult(id, buildTask(String(t.id), String(t.contextId), t.state)));
      } catch {
        return json(rpcError(id, -32602, "invalid task id"), 400);
      }
    }

    if (method === "tasks/cancel") {
      return json(
        rpcResult(id, buildTask(String(params?.id ?? ""), "", "canceled")),
      );
    }

    return json(rpcError(id, -32601, `method not found: ${method}`), 404);
  }),
});

export default http;
