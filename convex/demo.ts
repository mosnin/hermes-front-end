import { mutation } from "./_generated/server";
import { getOwnerId } from "./lib/auth";

/**
 * Seed the current account with demo data so the dashboard has something to
 * show before a real agent connects. Idempotent-ish: safe to run, but will
 * create duplicates if called repeatedly. Wired to a "Load demo data" button.
 */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getOwnerId(ctx);
    const now = Date.now();

    const researchAgent = await ctx.db.insert("agents", {
      ownerId,
      name: "Research Agent",
      description: "Long-running researcher deployed on AWS.",
      platform: "aws",
      status: "online",
      tokenHash: "demo-" + crypto.randomUUID(),
      lastHeartbeat: now,
      capabilities: ["web", "summarize", "memory"],
      tags: ["research"],
      createdAt: now,
    });

    const opsAgent = await ctx.db.insert("agents", {
      ownerId,
      name: "Ops Agent",
      description: "Local agent handling infra + deploys.",
      platform: "local",
      status: "degraded",
      tokenHash: "demo-" + crypto.randomUUID(),
      lastHeartbeat: now - 60_000,
      capabilities: ["shell", "git", "docker"],
      tags: ["ops"],
      createdAt: now,
    });

    const thread = await ctx.db.insert("threads", {
      ownerId,
      agentId: researchAgent,
      title: "Competitor landscape report",
      status: "active",
      messageCount: 2,
      createdAt: now,
      lastMessageAt: now,
    });

    await ctx.db.insert("messages", {
      ownerId,
      threadId: thread,
      agentId: researchAgent,
      role: "user",
      content: "Summarize the top 5 competitors and their pricing.",
      createdAt: now,
    });
    await ctx.db.insert("messages", {
      ownerId,
      threadId: thread,
      agentId: researchAgent,
      role: "assistant",
      content: "On it — pulling pricing pages and recent funding now.",
      createdAt: now + 1000,
    });

    for (const [title, status, priority] of [
      ["Draft competitor report", "in_progress", "high"],
      ["Set up nightly research run", "todo", "medium"],
      ["Fix Ops agent heartbeat", "blocked", "urgent"],
      ["Publish Q2 summary", "done", "low"],
    ] as const) {
      await ctx.db.insert("tasks", {
        ownerId,
        title,
        status,
        priority,
        assigneeAgentId: status === "blocked" ? opsAgent : researchAgent,
        orderKey: String(Number.MAX_SAFE_INTEGER - Date.now()).padStart(20, "0"),
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const [type, title, detail] of [
      ["system", "Research Agent connected", "Running on aws"],
      ["tool_call", "web.search", "query: competitor pricing 2026"],
      ["message", "assistant message", "On it — pulling pricing pages…"],
      ["status", "Ops Agent degraded", "Missed 2 heartbeats"],
    ] as const) {
      await ctx.db.insert("activity", {
        ownerId,
        agentId: type === "status" ? opsAgent : researchAgent,
        threadId: type === "message" ? thread : undefined,
        type,
        title,
        detail,
        createdAt: now + Math.floor(Math.random() * 5000),
      });
    }

    // A couple of agent-to-agent (A2A) messages so the network view has life.
    for (const [fromId, toId, content] of [
      [researchAgent, opsAgent, "Can you spin up a staging box for the nightly run?"],
      [opsAgent, researchAgent, "Done — staging is up, creds in the vault."],
    ] as const) {
      await ctx.db.insert("a2aMessages", {
        ownerId,
        fromAgentId: fromId,
        toAgentId: toId,
        threadId: thread,
        kind: "message",
        content,
        status: "delivered",
        createdAt: now + Math.floor(Math.random() * 4000),
        deliveredAt: now + 5000,
      });
    }

    return { ok: true };
  },
});
