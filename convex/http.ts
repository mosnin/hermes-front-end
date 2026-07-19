import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  sha256Hex,
  timingSafeEqualHex,
  verifySlackSignature,
  verifyStripeSignature,
} from "./lib/crypto";
import { planChangeFromEvent } from "./stripe";
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
      framework: body.framework ? String(body.framework) : undefined,
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

// POST /connector/logs — an agent (or the fleet worker on its behalf) ships a
// batch of log lines. Serviced for Team B/agentOps: wires straight into
// internal.logs.ingestBatch the same way /connector/activity feeds
// internal.activity.append; tenancy (companyId/spaceId/agentId) comes from the
// token-authenticated agent, never from the request body.
http.route({
  path: "/connector/logs",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!lines.length) return json({ error: "lines required" }, 400);
    const VALID_LEVELS = new Set(["debug", "info", "warn", "error"]);
    if (lines.some((l: any) => !l || typeof l.message !== "string" || !VALID_LEVELS.has(l.level))) {
      return json({ error: "each line requires level (debug|info|warn|error) and message" }, 400);
    }
    try {
      const res = await ctx.runMutation(internal.logs.ingestBatch, {
        companyId: agent.companyId,
        spaceId: agent.spaceId,
        agentId: agent._id,
        lines,
      });
      return json({ ok: true, ...res });
    } catch (e) {
      return json({ error: "invalid log line", detail: e instanceof Error ? e.message : String(e) }, 400);
    }
  }),
});

// POST /connector/config/poll — a deployed agent asks whether a config newer
// than what it has applied is pending (Team B's remote-config protocol; see
// convex/agentOps.ts). Tenancy comes from the token-authenticated agent.
http.route({
  path: "/connector/config/poll",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const pending = await ctx.runQuery(internal.agentOps.pollPendingConfig, {
      agentId: agent._id,
    });
    return json({ ok: true, pending });
  }),
});

// POST /connector/config/ack — the agent confirms it applied config {version}.
http.route({
  path: "/connector/config/ack",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    if (typeof body.version !== "number") {
      return json({ error: "version (number) required" }, 400);
    }
    const res = await ctx.runMutation(internal.agentOps.ackConfig, {
      agentId: agent._id,
      version: body.version,
    });
    return json(res);
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
    // One atomic mutation: idempotency + thread upsert + message + activity, so
    // a retried request can never leave the key committed without the message.
    const role = ["user", "assistant", "system", "tool"].includes(body.role)
      ? body.role
      : "assistant";
    const result = await ctx.runMutation(internal.connector.ingestMessage, {
      agentId: agent._id,
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      connectorKey: String(body.threadKey),
      threadTitle: body.threadTitle ?? "Untitled thread",
      role,
      content: String(body.content),
      toolCalls: body.toolCalls,
      idempotencyKey: request.headers.get("Idempotency-Key") ?? undefined,
    });
    if (result.deduped) return json({ ok: true, deduped: true });
    return json({ ok: true, threadId: result.threadId });
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
      // Capture in a separate transaction — the failed mutation rolled back, so
      // the record must be written here at the (non-transactional) gateway.
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.observability.capture, {
        companyId: agent.companyId,
        spaceId: agent.spaceId,
        source: "a2a",
        agentId: agent._id,
        kind: msg.includes("GuardViolation") ? "guard_violation" : "exception",
        message: msg,
      });
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

// POST /a2a/ack — recipient confirms it processed inbox messages. Body:
// { ids: [...] }. Unacked deliveries are requeued by the redelivery sweep, so
// acking is what makes delivery at-least-once instead of at-most-once.
http.route({
  path: "/a2a/ack",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (!ids.length) return json({ error: "ids required" }, 400);
    const res = await ctx.runMutation(internal.a2a.ackMessages, {
      agentId: agent._id,
      ids,
    });
    return json({ ok: true, ...res });
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
      !timingSafeEqualHex(trigger.webhookSecret ?? "", String(body.secret))
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
      name: "Cadre",
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

    // Inbound auth is default-closed: external A2A is disabled until an inbound
    // key is minted (agents.rotateInboundKey), then it must be presented.
    if (!agent.a2aInboundKeyHash) {
      return json(
        rpcError(null, -32001, "external A2A not enabled for this agent"),
        403,
      );
    }
    {
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

// POST /context/search — agent retrieves relevant memory (RAG) for its Space.
http.route({
  path: "/context/search",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    if (!body.query) return json({ error: "query required" }, 400);
    const memories = await ctx.runAction(
      internal.memories.retrieveForConnector,
      {
        spaceId: agent.spaceId,
        companyId: agent.companyId,
        query: String(body.query),
        limit: body.limit,
      },
    );
    return json({ ok: true, memories });
  }),
});

// POST /artifact — an agent submits a deliverable (text or link).
http.route({
  path: "/artifact",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    if (!body.name || (body.kind !== "text" && body.kind !== "link")) {
      return json({ error: "name and kind (text|link) required" }, 400);
    }
    const id = await ctx.runMutation(internal.artifacts.addFromConnector, {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      agentId: agent._id,
      name: String(body.name),
      kind: body.kind,
      text: body.text,
      url: body.url,
    });
    return json({ ok: true, artifactId: id });
  }),
});

// POST /integrations/execute — an agent runs a Composio tool through the
// control plane (token-authenticated).
http.route({
  path: "/integrations/execute",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    if (!body.toolkit || !body.tool) {
      return json({ error: "toolkit and tool required" }, 400);
    }
    try {
      const res = await ctx.runAction(
        internal.integrations.executeForConnector,
        {
          spaceId: agent.spaceId,
          companyId: agent.companyId,
          agentId: agent._id,
          toolkit: String(body.toolkit),
          tool: String(body.tool),
          arguments: body.arguments,
        },
      );
      return json(res);
    } catch (e) {
      return errorResponse(e);
    }
  }),
});

// POST /integrations/composio/webhook — Composio trigger events fire workflows.
http.route({
  path: "/integrations/composio/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Mandatory shared secret — never default-open.
    const secret = process.env.COMPOSIO_WEBHOOK_SECRET;
    if (!secret) return json({ error: "webhook not configured" }, 503);
    const provided =
      new URL(request.url).searchParams.get("secret") ??
      request.headers.get("x-composio-secret") ??
      "";
    if (provided !== secret) return json({ error: "unauthorized" }, 401);

    const body = (await request.json().catch(() => ({}))) as any;
    // Tenant: the Composio user_id encodes the Space ("space_<id>").
    const userId: string =
      body.userId ??
      body.user_id ??
      body.data?.user_id ??
      body.metadata?.userId ??
      "";
    if (!userId.startsWith("space_")) return json({ ok: true, matched: 0 });
    const spaceIdStr = userId.slice("space_".length);

    const slug = String(
      body.triggerSlug ?? body.metadata?.triggerName ?? body.type ?? body.appName ?? "",
    );
    if (!slug) return json({ ok: true, matched: 0 });

    let matched = 0;
    try {
      const matches = await ctx.runQuery(
        internal.triggers.eventTriggersInSpace,
        { spaceId: spaceIdStr as Id<"spaces">, needle: slug },
      );
      for (const t of matches) {
        await ctx.runMutation(internal.workflows.startFromTrigger, {
          workflowId: t.workflowId,
          trigger: "event",
        });
      }
      matched = matches.length;
    } catch {
      return json({ ok: true, matched: 0 });
    }
    return json({ ok: true, matched });
  }),
});

// POST /a2a/stream — real-time inbox delivery over SSE (lower latency than
// polling). Bounded (~20s); the connector reconnects to stay live.
http.route({
  path: "/a2a/stream",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const enc = new TextEncoder();
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(enc.encode(": connected\n\n"));
        for (let i = 0; i < 20; i++) {
          const messages = await ctx.runMutation(internal.a2a.pullInbox, {
            agentId: agent._id,
            limit: 25,
          });
          if (messages.length) {
            controller.enqueue(
              enc.encode(`data: ${JSON.stringify({ messages })}\n\n`),
            );
          } else {
            controller.enqueue(enc.encode(": ping\n\n"));
          }
          await sleep(1000);
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }),
});

// POST /connector/pull — the real-time work transport. One held SSE connection
// replaces the old ~2s busy-poll of /workflow/inbox + /a2a/inbox + heartbeat.
// The server ticks a single combined mutation, pushing workflow steps and A2A
// messages as they appear and backing off when idle. The connection is bounded
// (~25s) so the agent reconnects; a wedged connection can never leak a
// long-running server function.
http.route({
  path: "/connector/pull",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const enc = new TextEncoder();
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const deadline = Date.now() + 25_000;
    const BURST_MS = 250; // immediately after delivering work (drain bursts)
    const FAST_MS = 1000; // baseline tick
    const IDLE_MAX_MS = 3000; // slowest idle tick (adaptive backoff)

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(enc.encode(": connected\n\n"));
        let idleTicks = 0;
        let burst = false;
        try {
          while (Date.now() < deadline) {
            const { steps, messages } = await ctx.runMutation(
              internal.connector.pullWork,
              { agentId: agent._id },
            );
            if (steps.length || messages.length) {
              idleTicks = 0;
              burst = true; // more may be right behind — drain at burst speed
              controller.enqueue(
                enc.encode(`data: ${JSON.stringify({ steps, messages })}\n\n`),
              );
            } else {
              burst = false;
              idleTicks++;
              controller.enqueue(enc.encode(": ping\n\n"));
            }
            // Adaptive: burst-drain right after activity, baseline while warm,
            // backing off toward IDLE_MAX_MS when idle to keep agents cheap.
            const wait = burst
              ? BURST_MS
              : Math.min(FAST_MS + idleTicks * 500, IDLE_MAX_MS);
            await sleep(wait);
          }
        } catch {
          // Client disconnected or transient error — just end the stream; the
          // connector reconnects.
        }
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
  }),
});

// POST /connector/stream — an agent streams buffered chunks of a reply for
// real-time UI rendering; done=true finalizes into a permanent message.
http.route({
  path: "/connector/stream",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    if (!body.streamId || !body.threadKey) {
      return json({ error: "streamId and threadKey required" }, 400);
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
    await ctx.runMutation(internal.streaming.appendChunk, {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      threadId,
      streamId: String(body.streamId),
      seq: Number(body.seq ?? 0),
      text: String(body.text ?? ""),
      done: !!body.done,
    });
    if (body.done) {
      await ctx.runMutation(internal.streaming.finalizeStream, {
        companyId: agent.companyId,
        spaceId: agent.spaceId,
        threadId,
        streamId: String(body.streamId),
      });
    }
    return json({ ok: true });
  }),
});

// POST /connector/usage — an agent reports real LLM usage for one call:
// { model?, inputTokens?, outputTokens?, costUsd? }. Real numbers replace the
// flat per-event estimates, so budgets and spend dashboards track actual
// dollars (and the budget auto-pause fires on real spend).
http.route({
  path: "/connector/usage",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    const res = await ctx.runMutation(internal.connector.reportUsage, {
      agentId: agent._id,
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      model: body.model ? String(body.model) : undefined,
      inputTokens: Number(body.inputTokens ?? 0),
      outputTokens: Number(body.outputTokens ?? 0),
      costUsd: body.costUsd !== undefined ? Number(body.costUsd) : undefined,
    });
    return json(res);
  }),
});

// POST /connector/mcp — a deployed agent fetches the MCP servers assigned to it.
http.route({
  path: "/connector/mcp",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const servers = await ctx.runQuery(internal.mcp.forConnector, {
      spaceId: agent.spaceId,
      agentId: agent._id,
    });
    return json({ ok: true, servers });
  }),
});

// POST /connector/secrets — a deployed agent pulls its Space's secrets to use
// as credentials (token-authenticated). Values are injected into its env.
http.route({
  path: "/connector/secrets",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const secrets = await ctx.runQuery(internal.secrets.getForConnector, {
      spaceId: agent.spaceId,
    });
    // Every bulk credential access is audit-logged and attributable.
    await ctx.runMutation(internal.secrets.recordConnectorAccess, {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      agentId: agent._id,
      count: secrets.length,
    });
    return json({ ok: true, secrets });
  }),
});

// POST /bridges/slack/{bridgeId}?secret=... — Slack Events API webhook.
http.route({
  pathPrefix: "/bridges/slack/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const bridgeId = url.pathname.slice("/bridges/slack/".length);
    // Raw body first — Slack's HMAC covers the exact bytes on the wire.
    const rawBody = await request.text().catch(() => "");
    let body: any = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      // fall through with {}
    }

    // Slack URL verification handshake.
    if (body.type === "url_verification") {
      return json({ challenge: body.challenge });
    }

    let bridge: Doc<"bridges"> | null;
    try {
      bridge = await ctx.runQuery(internal.bridges.getById, {
        bridgeId: bridgeId as Id<"bridges">,
      });
    } catch {
      return json({ error: "invalid bridge" }, 400);
    }
    if (!bridge) return json({ error: "unknown bridge" }, 404);

    // Real Slack request signing when a signingSecret is configured:
    // v0=HMAC-SHA256("v0:{ts}:{body}") with timestamp freshness (anti-replay)
    // and constant-time comparison. Falls back to the shared ?secret= param for
    // bridges configured with sharedSecret instead.
    const signingSecret = bridge.config?.signingSecret as string | undefined;
    const sharedSecret = bridge.config?.sharedSecret as string | undefined;
    if (signingSecret) {
      const ok = await verifySlackSignature(
        signingSecret,
        request.headers.get("X-Slack-Request-Timestamp"),
        request.headers.get("X-Slack-Signature"),
        rawBody,
      );
      if (!ok) return json({ error: "bad signature" }, 401);
    } else if (sharedSecret && url.searchParams.get("secret") !== sharedSecret) {
      return json({ error: "unauthorized" }, 401);
    }

    const event = body.event ?? {};
    // Ignore bot's own messages / non-message events.
    if (event.bot_id || (event.type !== "message" && event.type !== "app_mention")) {
      return json({ ok: true });
    }
    if (event.text) {
      await ctx.runMutation(internal.bridges.handleInbound, {
        bridgeId: bridge._id,
        userLabel: String(event.user ?? "slack-user"),
        text: String(event.text),
      });
    }
    return json({ ok: true });
  }),
});

// POST /bridges/send — a deployed agent posts a message OUT to a chat channel
// (Slack/Telegram/Discord). Body: { bridgeId, text }. The bridge must belong to
// the agent's Space.
http.route({
  path: "/bridges/send",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const agent = await authAgent(ctx, request);
    if (!agent) return unauthorized();
    const body = await request.json().catch(() => ({}));
    if (!body.bridgeId || !body.text) {
      return json({ error: "bridgeId and text required" }, 400);
    }
    const bridge = await ctx.runQuery(internal.bridges.forAgentSend, {
      agentId: agent._id,
      bridgeId: body.bridgeId as Id<"bridges">,
    });
    if (!bridge) return json({ error: "unknown bridge for this agent" }, 404);
    const result = await ctx.runAction(internal.bridges.sendOutbound, {
      bridgeId: bridge._id,
      text: String(body.text),
    });
    return json({ ok: result.ok, detail: result.detail });
  }),
});

// POST /billing/stripe/webhook — Stripe events drive plan entitlements.
// Signature-verified (t/v1 HMAC over "{t}.{rawBody}" with anti-replay);
// unsigned or stale requests are rejected before any state changes.
http.route({
  path: "/billing/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return json({ error: "stripe not configured" }, 501);
    const rawBody = await request.text().catch(() => "");
    const ok = await verifyStripeSignature(
      secret,
      request.headers.get("Stripe-Signature"),
      rawBody,
    );
    if (!ok) return json({ error: "bad signature" }, 401);

    let event: any = {};
    try {
      event = JSON.parse(rawBody);
    } catch {
      return json({ error: "bad payload" }, 400);
    }
    const change = planChangeFromEvent(event);
    if (change) {
      await ctx.runMutation(internal.stripe.applyPlanFromStripe, {
        spaceId: change.spaceId as Id<"spaces">,
        plan: change.plan,
        stripeEvent: String(event.type),
      });
    }
    // Subscription lapsed/canceled — stop billing customers from continuing to
    // run hosted fleet agents on our infra. Separate from the plan downgrade
    // above so a future event type can trigger this without also touching plan.
    if (event.type === "customer.subscription.deleted") {
      const spaceId = event.data?.object?.metadata?.spaceId;
      if (spaceId) {
        await ctx.runMutation(internal.stripe.lapseHostedFleet, {
          spaceId: spaceId as Id<"spaces">,
          stripeEvent: String(event.type),
        });
      }
    }
    // Always 200 for recognized-but-ignored events so Stripe stops retrying.
    return json({ received: true });
  }),
});

// ===========================================================================
// Public REST API v1 — authenticated by an API key (hk_...) minted in
// Developer settings (convex/apiKeys.ts). Consistent JSON envelope:
//   success: { data: <payload> }
//   failure: { error: { code, message } }
// Every route is rate-limited per key (fixed window, apiUsage table) and
// counted for the usage endpoint. `docs/API.md` + `sdk/` are the client-facing
// reference for this surface — keep them in sync with routes added here.
// ===========================================================================

type ApiAuth = {
  spaceId: Id<"spaces">;
  companyId: string;
  apiKeyId: Id<"apiKeys">;
  rateLimitPerMinute?: number;
  scopes?: string[];
};

// Scope model (feature 20 hardening): each route declares the single scope
// it needs (e.g. "tasks:write"). A key with no `scopes` array set (every key
// minted before scoped keys existed, and any minted without explicit scopes)
// is treated as full-access for backward compatibility — `apiKeys.scopes` is
// in schema but `apiKeys.create` doesn't collect it from the mint UI yet;
// cross-team request below extends it. Once a key does carry `scopes`, it is
// strictly allow-listed: unlisted routes 403.
const ALL_SCOPES = [
  "agents:read",
  "deploys:read",
  "tasks:read",
  "tasks:write",
  "messages:write",
  "workflows:read",
  "workflows:write",
  "approvals:read",
  "approvals:write",
  "usage:read",
] as const;
type ApiScope = (typeof ALL_SCOPES)[number];

function apiError(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}
function apiOk(data: unknown, status = 200) {
  return json({ data }, status);
}

async function authApiKey(
  ctx: { runQuery: any; runMutation: any },
  request: Request,
): Promise<ApiAuth | null> {
  const header = request.headers.get("Authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key.startsWith("hk_")) return null;
  const keyHash = await sha256Hex(key);
  const row = await ctx.runQuery(internal.apiKeys.byHash, { keyHash });
  if (!row || row.revoked) return null;
  if (row.expiresAt && row.expiresAt < Date.now()) return null;
  await ctx.runMutation(internal.publicApi.touchKey, { keyId: row._id });
  return {
    spaceId: row.spaceId,
    companyId: row.companyId,
    apiKeyId: row._id,
    rateLimitPerMinute: row.rateLimitPerMinute,
    scopes: row.scopes,
  };
}

/**
 * Auth + rate-limit + scope gate shared by every /api/v1/* handler. Returns
 * either a resolved `ApiAuth` to proceed with, or a ready-to-return error
 * Response. `requiredScope` is checked before the rate limit is recorded so
 * a 403 never counts against the key's quota.
 */
async function gate(
  ctx: { runQuery: any; runMutation: any },
  request: Request,
  route: string,
  requiredScope?: ApiScope,
): Promise<ApiAuth | Response> {
  const auth = await authApiKey(ctx, request);
  if (!auth) return apiError("unauthorized", "missing or invalid API key", 401);
  if (requiredScope && auth.scopes && !auth.scopes.includes(requiredScope)) {
    return apiError(
      "forbidden",
      `this key is not scoped for '${requiredScope}'`,
      403,
    );
  }
  const rl = await ctx.runMutation(internal.publicApi.recordRequest, {
    apiKeyId: auth.apiKeyId,
    companyId: auth.companyId,
    spaceId: auth.spaceId,
    route,
    limitPerMinute: auth.rateLimitPerMinute,
  });
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({
        error: { code: "rate_limited", message: `rate limit: ${rl.limit}/minute` },
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }
  return auth;
}

/** Parse the shared `?cursor=&limit=` pagination query params. */
function paginationParams(url: URL): { cursor?: string | null; limit?: number } {
  const cursor = url.searchParams.get("cursor");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  return {
    cursor: cursor ?? undefined,
    limit: limit && Number.isFinite(limit) ? limit : undefined,
  };
}

http.route({
  path: "/api/v1/agents",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const auth = await gate(ctx, request, "GET /api/v1/agents", "agents:read");
    if (auth instanceof Response) return auth;
    const { cursor, limit } = paginationParams(new URL(request.url));
    const result = await ctx.runQuery(internal.publicApi.listAgents, {
      spaceId: auth.spaceId,
      cursor,
      limit,
    });
    return apiOk(result);
  }),
});

http.route({
  path: "/api/v1/deploys",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const auth = await gate(ctx, request, "GET /api/v1/deploys", "deploys:read");
    if (auth instanceof Response) return auth;
    const { cursor, limit } = paginationParams(new URL(request.url));
    const result = await ctx.runQuery(internal.publicApi.listDeploys, {
      spaceId: auth.spaceId,
      cursor,
      limit,
    });
    return apiOk(result);
  }),
});

http.route({
  path: "/api/v1/tasks",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const auth = await gate(ctx, request, "GET /api/v1/tasks", "tasks:read");
    if (auth instanceof Response) return auth;
    const { cursor, limit } = paginationParams(new URL(request.url));
    const result = await ctx.runQuery(internal.publicApi.listTasks, {
      spaceId: auth.spaceId,
      cursor,
      limit,
    });
    return apiOk(result);
  }),
});

http.route({
  path: "/api/v1/tasks",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = await gate(ctx, request, "POST /api/v1/tasks", "tasks:write");
    if (auth instanceof Response) return auth;
    const body = await request.json().catch(() => ({}));
    if (!body.title) return apiError("bad_request", "title required", 400);
    const id = await ctx.runMutation(internal.publicApi.createTask, {
      spaceId: auth.spaceId,
      companyId: auth.companyId,
      title: String(body.title),
      description: body.description,
    });
    return apiOk({ id }, 201);
  }),
});

http.route({
  path: "/api/v1/messages",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = await gate(ctx, request, "POST /api/v1/messages", "messages:write");
    if (auth instanceof Response) return auth;
    const body = await request.json().catch(() => ({}));
    if (!body.content) return apiError("bad_request", "content required", 400);
    const res = await ctx.runMutation(internal.publicApi.sendMessage, {
      spaceId: auth.spaceId,
      companyId: auth.companyId,
      content: String(body.content),
      threadTitle: body.threadTitle,
    });
    return apiOk(res, 201);
  }),
});

http.route({
  path: "/api/v1/workflows",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const auth = await gate(ctx, request, "GET /api/v1/workflows", "workflows:read");
    if (auth instanceof Response) return auth;
    const { cursor, limit } = paginationParams(new URL(request.url));
    const result = await ctx.runQuery(internal.publicApi.listWorkflows, {
      spaceId: auth.spaceId,
      cursor,
      limit,
    });
    return apiOk(result);
  }),
});

http.route({
  path: "/api/v1/workflows/run",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = await gate(ctx, request, "POST /api/v1/workflows/run", "workflows:write");
    if (auth instanceof Response) return auth;
    const body = await request.json().catch(() => ({}));
    if (!body.workflowId) return apiError("bad_request", "workflowId required", 400);
    try {
      const runId = await ctx.runMutation(internal.workflows.startFromTrigger, {
        workflowId: body.workflowId as Id<"workflows">,
        trigger: "api",
      });
      return apiOk({ runId }, 201);
    } catch {
      return apiError("bad_request", "invalid workflowId", 400);
    }
  }),
});

http.route({
  path: "/api/v1/workflows/runs",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const auth = await gate(ctx, request, "GET /api/v1/workflows/runs", "workflows:read");
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const workflowIdParam = url.searchParams.get("workflowId");
    const { cursor, limit } = paginationParams(url);
    const result = await ctx.runQuery(internal.publicApi.listWorkflowRuns, {
      spaceId: auth.spaceId,
      workflowId: workflowIdParam ? (workflowIdParam as Id<"workflows">) : undefined,
      cursor,
      limit,
    });
    return apiOk(result);
  }),
});

http.route({
  path: "/api/v1/approvals",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const auth = await gate(ctx, request, "GET /api/v1/approvals", "approvals:read");
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const { cursor, limit } = paginationParams(url);
    const result = await ctx.runQuery(internal.approvals.listForApi, {
      spaceId: auth.spaceId,
      status,
      cursor,
      limit,
    });
    return apiOk(result);
  }),
});

// POST /api/v1/approvals/bulk-decide — body { approvalIds: string[], approve: boolean }.
// An exact `path` route always wins over the `pathPrefix` single-decide route
// below regardless of registration order (Convex's router checks exact
// matches first), so "bulk-decide" never falls into the `/:id/decide` regex.
http.route({
  path: "/api/v1/approvals/bulk-decide",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = await gate(ctx, request, "POST /api/v1/approvals/bulk-decide", "approvals:write");
    if (auth instanceof Response) return auth;
    const body = await request.json().catch(() => ({}));
    if (typeof body.approve !== "boolean") {
      return apiError("bad_request", "approve (boolean) required", 400);
    }
    if (!Array.isArray(body.approvalIds) || body.approvalIds.length === 0) {
      return apiError("bad_request", "approvalIds (non-empty array) required", 400);
    }
    const result = await ctx.runMutation(internal.approvals.bulkDecideForApi, {
      spaceId: auth.spaceId,
      companyId: auth.companyId,
      approvalIds: body.approvalIds as Id<"approvals">[],
      approve: body.approve,
    });
    return apiOk(result);
  }),
});

// POST /api/v1/approvals/{id}/decide — body { approve: boolean }.
http.route({
  pathPrefix: "/api/v1/approvals/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const rest = url.pathname.slice("/api/v1/approvals/".length);
    const match = rest.match(/^([^/]+)\/decide$/);
    if (!match) return apiError("not_found", "unknown route", 404);
    const auth = await gate(ctx, request, "POST /api/v1/approvals/:id/decide", "approvals:write");
    if (auth instanceof Response) return auth;
    const body = await request.json().catch(() => ({}));
    if (typeof body.approve !== "boolean") {
      return apiError("bad_request", "approve (boolean) required", 400);
    }
    try {
      await ctx.runMutation(internal.approvals.decideForApi, {
        spaceId: auth.spaceId,
        companyId: auth.companyId,
        approvalId: match[1] as Id<"approvals">,
        approve: body.approve,
      });
      return apiOk({ ok: true });
    } catch (e) {
      return apiError("bad_request", e instanceof Error ? e.message : String(e), 400);
    }
  }),
});

http.route({
  path: "/api/v1/usage",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const auth = await gate(ctx, request, "GET /api/v1/usage", "usage:read");
    if (auth instanceof Response) return auth;
    const usage = await ctx.runQuery(internal.publicApi.usageSummary, {
      apiKeyId: auth.apiKeyId,
    });
    return apiOk(usage);
  }),
});

// ===========================================================================
// One-click approval links (feature 19) — signed short-lived single-use
// tokens minted by approvals.issueTokensAndDeliver. No API key or auth cookie
// needed: the token itself IS the credential, hashed at rest and burned on
// first use. Reachable from an email/webhook link, so this responds with a
// small HTML confirmation page by default (JSON via ?format=json).
// ===========================================================================

function approvalResultPage(
  ok: boolean,
  message: string,
  title?: string,
): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>Cadre approvals</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#eee;
display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;}
.card{max-width:420px;text-align:center;border:1px solid #262626;border-radius:20px;
padding:32px;background:#111;}
h1{font-size:18px;margin:0 0 8px;color:${ok ? "#34d399" : "#f87171"};}
p{color:#a3a3a3;font-size:14px;line-height:1.5;margin:0;}
</style></head>
<body><div class="card"><h1>${ok ? "✓ " : "✕ "}${message}</h1>
${title ? `<p>${title}</p>` : ""}</div></body></html>`;
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

http.route({
  pathPrefix: "/api/v1/approvals/token/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const token = url.pathname.slice("/api/v1/approvals/token/".length);
    const wantsJson =
      url.searchParams.get("format") === "json" ||
      (request.headers.get("Accept") ?? "").includes("application/json");
    const override = url.searchParams.get("action");
    if (!token) {
      return wantsJson ? apiError("bad_request", "token required", 400) : approvalResultPage(false, "Missing token");
    }
    const result = await ctx.runAction(internal.approvals.decideByToken, {
      token,
      override: override === "approve" || override === "deny" ? override : undefined,
    });
    if (!result.ok) {
      return wantsJson
        ? apiError("token_invalid", result.error, 400)
        : approvalResultPage(false, result.error);
    }
    const message =
      result.decision === "approve" ? "Approved" : "Rejected";
    return wantsJson
      ? apiOk({ approvalId: result.approvalId, decision: result.decision })
      : approvalResultPage(true, message, result.title);
  }),
});

export default http;
