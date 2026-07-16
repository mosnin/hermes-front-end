import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";

/** Seed a Space with demo data so the dashboard has life before a real agent. */
export const seed = mutation({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const { companyId } = scope;
    const now = Date.now();

    const researchAgent = await ctx.db.insert("agents", {
      companyId,
      spaceId,
      name: "Research Agent",
      description: "Long-running researcher deployed on AWS.",
      platform: "aws",
      kind: "hermes",
      status: "online",
      tokenHash: "demo-" + crypto.randomUUID(),
      lastHeartbeat: now,
      capabilities: ["web", "summarize", "memory"],
      tags: ["research"],
      createdAt: now,
    });

    const opsAgent = await ctx.db.insert("agents", {
      companyId,
      spaceId,
      name: "Ops Agent",
      description: "Local agent handling infra + deploys.",
      platform: "local",
      kind: "hermes",
      status: "degraded",
      tokenHash: "demo-" + crypto.randomUUID(),
      lastHeartbeat: now - 60_000,
      capabilities: ["shell", "git", "docker"],
      tags: ["ops"],
      createdAt: now,
    });

    const thread = await ctx.db.insert("threads", {
      companyId,
      spaceId,
      agentId: researchAgent,
      title: "Competitor landscape report",
      status: "active",
      messageCount: 2,
      createdAt: now,
      lastMessageAt: now,
    });

    await ctx.db.insert("messages", {
      companyId,
      spaceId,
      threadId: thread,
      agentId: researchAgent,
      role: "user",
      content: "Summarize the top 5 competitors and their pricing.",
      createdAt: now,
    });
    await ctx.db.insert("messages", {
      companyId,
      spaceId,
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
        companyId,
        spaceId,
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
        companyId,
        spaceId,
        agentId: type === "status" ? opsAgent : researchAgent,
        threadId: type === "message" ? thread : undefined,
        type,
        title,
        detail,
        createdAt: now + Math.floor(Math.random() * 5000),
      });
    }

    for (const [fromId, toId, content] of [
      [researchAgent, opsAgent, "Can you spin up a staging box for the nightly run?"],
      [opsAgent, researchAgent, "Done — staging is up, creds in the vault."],
    ] as const) {
      await ctx.db.insert("a2aMessages", {
        companyId,
        spaceId,
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

    await ctx.db.insert("workEvents", {
      companyId,
      spaceId,
      actorType: "system",
      category: "system",
      action: "demo_seeded",
      summary: "Loaded demo data (agents, thread, tasks, A2A messages)",
      createdAt: now,
    });

    return { ok: true };
  },
});
