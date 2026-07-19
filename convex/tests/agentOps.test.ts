import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { decideScale } from "../agentOps";

const modules = import.meta.glob("../**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "user_owner", org_id: "org_ops" });
  const spaceId = (await owner.mutation(api.spaces.create, { name: "Ops" })) as Id<"spaces">;
  await t.run(async (ctx) => {
    await ctx.db.patch(spaceId, { plan: "team" });
  });
  const agentId = (await t.run(async (ctx) => {
    const s = await ctx.db.get(spaceId);
    return await ctx.db.insert("agents", {
      companyId: s!.companyId,
      spaceId,
      kind: "hermes",
      name: "Worker One",
      status: "online",
      model: "claude-opus-4-8",
      systemPrompt: "You are a helpful worker.",
      toolsets: ["browser"],
      createdAt: Date.now(),
    });
  })) as Id<"agents">;
  return { t, owner, spaceId, agentId };
}

describe("agentOps — remote config push (feature 7)", () => {
  test("push creates a pendingConfig with an incrementing version", async () => {
    const { owner, spaceId, agentId } = await setup();
    const r1 = await owner.mutation(api.agentOps.pushConfig, {
      spaceId,
      agentId,
      model: "claude-sonnet-4-5",
    });
    expect(r1.version).toBe(1);

    const drift1 = await owner.query(api.agentOps.configDrift, { spaceId, agentId });
    expect(drift1?.drift).toBe(true);
    expect(drift1?.pending?.model).toBe("claude-sonnet-4-5");
    expect(drift1?.applied).toBeNull();

    const r2 = await owner.mutation(api.agentOps.pushConfig, {
      spaceId,
      agentId,
      systemPrompt: "New prompt",
    });
    expect(r2.version).toBe(2);
    // Second push should carry forward the model from the first pending push.
    const drift2 = await owner.query(api.agentOps.configDrift, { spaceId, agentId });
    expect(drift2?.pending?.model).toBe("claude-sonnet-4-5");
    expect(drift2?.pending?.systemPrompt).toBe("New prompt");
  });

  test("connector poll + ack protocol clears drift and syncs live persona fields", async () => {
    const { t, owner, spaceId, agentId } = await setup();
    await owner.mutation(api.agentOps.pushConfig, {
      spaceId,
      agentId,
      model: "claude-sonnet-4-5",
      toolAllowlist: ["browser", "code-exec"],
    });

    const polled = await t.query(internal.agentOps.pollPendingConfig, { agentId });
    expect(polled?.version).toBe(1);

    const ack = await t.mutation(internal.agentOps.ackConfig, { agentId, version: 1 });
    expect(ack.ok).toBe(true);

    const drift = await owner.query(api.agentOps.configDrift, { spaceId, agentId });
    expect(drift?.drift).toBe(false);
    expect(drift?.applied?.version).toBe(1);
    expect(drift?.configAckedAt).not.toBeNull();

    const agent = await owner.query(api.agents.get, { spaceId, agentId });
    expect(agent?.model).toBe("claude-sonnet-4-5");
    expect(agent?.toolsets).toEqual(["browser", "code-exec"]);

    // A stale ack (wrong version) is rejected without side effects.
    const staleAck = await t.mutation(internal.agentOps.ackConfig, { agentId, version: 99 });
    expect(staleAck.ok).toBe(false);
  });

  test("cancelPendingConfig clears drift without touching appliedConfig", async () => {
    const { owner, spaceId, agentId } = await setup();
    await owner.mutation(api.agentOps.pushConfig, { spaceId, agentId, model: "x" });
    await owner.mutation(api.agentOps.cancelPendingConfig, { spaceId, agentId });
    const drift = await owner.query(api.agentOps.configDrift, { spaceId, agentId });
    expect(drift?.pending).toBeNull();
    expect(drift?.drift).toBe(false);
  });

  test("a viewer cannot push config", async () => {
    const { t, owner, spaceId, agentId } = await setup();
    const viewerId = "user_viewer_ops";
    await owner.mutation(api.spaces.addMember, { spaceId, userId: viewerId, role: "viewer" });
    const viewer = t.withIdentity({ subject: viewerId, org_id: "org_ops" });
    await expect(
      viewer.mutation(api.agentOps.pushConfig, { spaceId, agentId, model: "x" }),
    ).rejects.toThrow(/Forbidden/);
  });
});

describe("agentOps — snapshots / cloning (feature 9)", () => {
  test("snapshotAgent captures persona into a space template", async () => {
    const { owner, spaceId, agentId } = await setup();
    const templateId = await owner.mutation(api.agentOps.snapshotAgent, {
      spaceId,
      agentId,
      name: "Golden Worker",
    });
    const templates = await owner.query(api.agentOps.listTemplates, { spaceId });
    const t = templates.find((x) => x._id === templateId);
    expect(t).toBeDefined();
    expect(t?.suggestedModel).toBe("claude-opus-4-8");
    expect(t?.systemPrompt).toBe("You are a helpful worker.");
    expect(t?.toolsets).toEqual(["browser"]);
    expect(t?.sourceAgentId).toBe(agentId);
  });

  test("deployFromTemplate provisions N agents stamped from the template", async () => {
    const { owner, spaceId, agentId } = await setup();
    const templateId = await owner.mutation(api.agentOps.snapshotAgent, {
      spaceId,
      agentId,
      name: "Golden Worker",
    });
    const res = await owner.action(api.agentOps.deployFromTemplate, {
      spaceId,
      templateId,
      count: 3,
      namePrefix: "Clone",
    });
    expect(res.deployed).toHaveLength(3);
    const agents = await owner.query(api.agents.list, { spaceId });
    const clones = agents.filter((a) => a.templateId === templateId);
    expect(clones).toHaveLength(3);
    for (const c of clones) {
      expect(c.model).toBe("claude-opus-4-8");
      expect(c.systemPrompt).toBe("You are a helpful worker.");
    }
    const templates = await owner.query(api.agentOps.listTemplates, { spaceId });
    const t = templates.find((x) => x._id === templateId);
    expect(t?.installCount).toBe(3);
  });

  test("deployFromTemplate respects the plan's hosted-agent ceiling", async () => {
    const { t, owner, spaceId, agentId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(spaceId, { plan: "free" }); // hostedAgents limit = 0
    });
    const templateId = await owner.mutation(api.agentOps.snapshotAgent, {
      spaceId,
      agentId,
      name: "Golden Worker",
    });
    await expect(
      owner.action(api.agentOps.deployFromTemplate, { spaceId, templateId, count: 1 }),
    ).rejects.toThrow(/[Hh]osted agent limit/);
  });

  test("a non-operator (viewer) cannot snapshot", async () => {
    const { t, owner, spaceId, agentId } = await setup();
    const viewerId = "user_viewer_snap";
    await owner.mutation(api.spaces.addMember, { spaceId, userId: viewerId, role: "viewer" });
    const viewer = t.withIdentity({ subject: viewerId, org_id: "org_ops" });
    await expect(
      viewer.mutation(api.agentOps.snapshotAgent, { spaceId, agentId }),
    ).rejects.toThrow(/Forbidden/);
  });
});

describe("agentOps — squad autoscale config (feature 8, engine lands next cycle)", () => {
  test("setSquadAutoscale persists min/max/queueDepthPerAgent and is admin-gated", async () => {
    const { t, owner, spaceId } = await setup();
    const squadId = (await owner.mutation(api.squads.create, {
      spaceId,
      name: "Support Squad",
    })) as Id<"squads">;

    await owner.mutation(api.agentOps.setSquadAutoscale, {
      spaceId,
      squadId,
      enabled: true,
      minAgents: 1,
      maxAgents: 5,
      queueDepthPerAgent: 3,
      cooldownMinutes: 10,
    });

    const squad = await t.run(async (ctx) => ctx.db.get(squadId));
    expect(squad?.autoscale?.enabled).toBe(true);
    expect(squad?.autoscale?.maxAgents).toBe(5);

    const operatorId = "user_operator_scale";
    await owner.mutation(api.spaces.addMember, { spaceId, userId: operatorId, role: "operator" });
    const operator = t.withIdentity({ subject: operatorId, org_id: "org_ops" });
    await expect(
      operator.mutation(api.agentOps.setSquadAutoscale, {
        spaceId,
        squadId,
        enabled: true,
        minAgents: 1,
        maxAgents: 5,
        queueDepthPerAgent: 3,
        cooldownMinutes: 10,
      }),
    ).rejects.toThrow(/Forbidden/);
  });

  test("rejects an invalid min/max range", async () => {
    const { owner, spaceId } = await setup();
    const squadId = (await owner.mutation(api.squads.create, {
      spaceId,
      name: "Bad Squad",
    })) as Id<"squads">;
    await expect(
      owner.mutation(api.agentOps.setSquadAutoscale, {
        spaceId,
        squadId,
        enabled: true,
        minAgents: 5,
        maxAgents: 2,
        queueDepthPerAgent: 3,
        cooldownMinutes: 10,
      }),
    ).rejects.toThrow(/maxAgents/);
  });

  test("decideScale: scales up under load, down when slack, holds within band", () => {
    expect(
      decideScale({ queueDepth: 20, onlineAgents: 2, minAgents: 1, maxAgents: 10, queueDepthPerAgent: 3 }),
    ).toBe("up");
    expect(
      decideScale({ queueDepth: 20, onlineAgents: 10, minAgents: 1, maxAgents: 10, queueDepthPerAgent: 3 }),
    ).toBe("hold"); // already at maxAgents, can't scale up further
    expect(
      decideScale({ queueDepth: 0, onlineAgents: 5, minAgents: 1, maxAgents: 10, queueDepthPerAgent: 3 }),
    ).toBe("down");
    expect(
      decideScale({ queueDepth: 0, onlineAgents: 1, minAgents: 1, maxAgents: 10, queueDepthPerAgent: 3 }),
    ).toBe("hold"); // already at minAgents, can't scale down further
    expect(
      decideScale({ queueDepth: 6, onlineAgents: 2, minAgents: 1, maxAgents: 10, queueDepthPerAgent: 3 }),
    ).toBe("hold"); // ratio == queueDepthPerAgent exactly, no breach
  });

  test("squadLoadSnapshot counts online agents and open/in-progress tasks scoped to the squad", async () => {
    const { t, owner, spaceId, agentId } = await setup();
    const squadId = (await owner.mutation(api.squads.create, {
      spaceId,
      name: "Load Squad",
    })) as Id<"squads">;
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { squadId, status: "online" });
      const s = await ctx.db.get(spaceId);
      for (let i = 0; i < 4; i++) {
        await ctx.db.insert("tasks", {
          companyId: s!.companyId,
          spaceId,
          squadId,
          title: `t${i}`,
          status: i < 3 ? "todo" : "done",
          priority: "medium",
          orderKey: String(i),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });
    const snap = await t.query(internal.agentOps.squadLoadSnapshot, { squadId });
    expect(snap?.onlineAgents).toBe(1);
    expect(snap?.queueDepth).toBe(3); // only the 3 "todo" tasks count, not "done"
  });
});

describe("logs — live log streaming (feature 6)", () => {
  test("ingestBatch writes lines scoped to the agent's own tenancy, tail returns newest-first", async () => {
    const { t, owner, spaceId, agentId } = await setup();
    const companyId = await t.run(async (ctx) => (await ctx.db.get(spaceId))!.companyId);

    await t.mutation(internal.logs.ingestBatch, {
      companyId,
      spaceId,
      agentId,
      lines: [
        { level: "info", message: "booting", ts: 1000 },
        { level: "warn", message: "slow disk", ts: 2000 },
        { level: "error", message: "boom", ts: 3000 },
      ],
    });

    const tail = await owner.query(api.logs.tail, { spaceId, agentId });
    expect(tail).toHaveLength(3);
    expect(tail[0].message).toBe("boom"); // newest first

    const errorsOnly = await owner.query(api.logs.tail, { spaceId, agentId, level: "error" });
    expect(errorsOnly).toHaveLength(1);
    expect(errorsOnly[0].message).toBe("boom");
  });

  test("ingestBatch caps a batch at MAX_BATCH and truncates oversized messages", async () => {
    const { t, spaceId, agentId } = await setup();
    const companyId = await t.run(async (ctx) => (await ctx.db.get(spaceId))!.companyId);
    const lines = Array.from({ length: 250 }, (_, i) => ({
      level: "debug" as const,
      message: i === 0 ? "x".repeat(9000) : `line ${i}`,
      ts: i,
    }));
    const res = await t.mutation(internal.logs.ingestBatch, { companyId, spaceId, agentId, lines });
    expect(res.inserted).toBe(200);
    expect(res.dropped).toBe(50);
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("agentLogs")
        .withIndex("by_agent_time", (q) => q.eq("agentId", agentId))
        .collect(),
    );
    expect(rows).toHaveLength(200);
    expect(rows.find((r) => r.ts === 0)!.message.length).toBe(8000);
  });

  test("levelCounts summarizes the recent window by level", async () => {
    const { t, owner, spaceId, agentId } = await setup();
    const companyId = await t.run(async (ctx) => (await ctx.db.get(spaceId))!.companyId);
    const now = Date.now();
    await t.mutation(internal.logs.ingestBatch, {
      companyId,
      spaceId,
      agentId,
      lines: [
        { level: "info", message: "a", ts: now },
        { level: "info", message: "b", ts: now },
        { level: "error", message: "c", ts: now },
      ],
    });
    const counts = await owner.query(api.logs.levelCounts, { spaceId, agentId });
    expect(counts).toEqual({ debug: 0, info: 2, warn: 0, error: 1 });
  });

  test("sweepRetention deletes lines older than the retention window", async () => {
    const { t, spaceId, agentId } = await setup();
    const companyId = await t.run(async (ctx) => (await ctx.db.get(spaceId))!.companyId);
    const OLD = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago, past the 7-day retention
    await t.mutation(internal.logs.ingestBatch, {
      companyId,
      spaceId,
      agentId,
      lines: [
        { level: "info", message: "stale", ts: OLD },
        { level: "info", message: "fresh", ts: Date.now() },
      ],
    });
    const res = await t.mutation(internal.logs.sweepRetention, { cursor: null });
    expect(res.deleted).toBe(1);
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("agentLogs")
        .withIndex("by_agent_time", (q) => q.eq("agentId", agentId))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toBe("fresh");
  });

  test("a caller outside the Space cannot read another Space's logs", async () => {
    const { t, spaceId, agentId } = await setup();
    const companyId = await t.run(async (ctx) => (await ctx.db.get(spaceId))!.companyId);
    await t.mutation(internal.logs.ingestBatch, {
      companyId,
      spaceId,
      agentId,
      lines: [{ level: "info", message: "secret", ts: Date.now() }],
    });
    const outsider = t.withIdentity({ subject: "user_outsider_logs", org_id: "org_other" });
    await expect(outsider.query(api.logs.tail, { spaceId, agentId })).rejects.toThrow(
      /not a member|Space not found/,
    );
  });
});
