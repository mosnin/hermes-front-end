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

  test("evaluateAutoscale scales up a squad above its queue-depth threshold using its template, tagging the new agent autoscaled", async () => {
    const { t, owner, spaceId, agentId } = await setup();
    const squadId = (await owner.mutation(api.squads.create, {
      spaceId,
      name: "Scale Up Squad",
    })) as Id<"squads">;
    const templateId = await owner.mutation(api.agentOps.snapshotAgent, {
      spaceId,
      agentId,
      name: "Autoscale Template",
    });
    await owner.mutation(api.agentOps.setSquadAutoscale, {
      spaceId,
      squadId,
      enabled: true,
      minAgents: 1,
      maxAgents: 5,
      queueDepthPerAgent: 2,
      cooldownMinutes: 10,
      templateId,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { squadId, status: "online" });
      const s = await ctx.db.get(spaceId);
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("tasks", {
          companyId: s!.companyId,
          spaceId,
          squadId,
          title: `t${i}`,
          status: "todo",
          priority: "medium",
          orderKey: String(i),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });

    const res = await t.action(internal.agentOps.evaluateAutoscale, {});
    expect(res.scaled).toBe(1);

    const agents = await owner.query(api.agents.list, { spaceId });
    const created = agents.filter((a) => a.squadId === squadId && a._id !== agentId);
    expect(created).toHaveLength(1);
    expect(created[0].templateId).toBe(templateId);
    expect((created[0].meta as { autoscaled?: boolean } | undefined)?.autoscaled).toBe(true);

    const squad = await t.run(async (ctx) => ctx.db.get(squadId));
    expect(squad?.autoscale?.lastScaleDirection).toBe("up");
    expect(squad?.autoscale?.lastScaleAt).toBeDefined();
  });

  test("evaluateAutoscale holds (does not scale) without a template even under heavy load", async () => {
    const { t, owner, spaceId, agentId } = await setup();
    const squadId = (await owner.mutation(api.squads.create, {
      spaceId,
      name: "No Template Squad",
    })) as Id<"squads">;
    await owner.mutation(api.agentOps.setSquadAutoscale, {
      spaceId,
      squadId,
      enabled: true,
      minAgents: 1,
      maxAgents: 5,
      queueDepthPerAgent: 1,
      cooldownMinutes: 10,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { squadId, status: "online" });
    });
    const res = await t.action(internal.agentOps.evaluateAutoscale, {});
    expect(res.scaled).toBe(0);
    const agents = await owner.query(api.agents.list, { spaceId });
    expect(agents.filter((a) => a.squadId === squadId)).toHaveLength(1);
  });

  test("evaluateAutoscale honors cooldown and only reclaims autoscaler-owned agents on scale-down", async () => {
    const { t, owner, spaceId, agentId } = await setup();
    const squadId = (await owner.mutation(api.squads.create, {
      spaceId,
      name: "Scale Down Squad",
    })) as Id<"squads">;
    const templateId = await owner.mutation(api.agentOps.snapshotAgent, {
      spaceId,
      agentId,
      name: "T",
    });
    await owner.mutation(api.agentOps.setSquadAutoscale, {
      spaceId,
      squadId,
      enabled: true,
      minAgents: 0,
      maxAgents: 5,
      queueDepthPerAgent: 3,
      cooldownMinutes: 10,
      templateId,
    });
    // A manually-provisioned (non-autoscaled) online agent with no queue load:
    // decideScale says "down", but there's nothing the autoscaler owns to
    // reclaim, so it must hold rather than touch a human-managed agent.
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, {
        squadId,
        status: "online",
        vmProvider: "cloudflare",
        vmId: "vm-manual",
        deploymentStatus: "running",
      });
    });
    const res1 = await t.action(internal.agentOps.evaluateAutoscale, {});
    expect(res1.scaled).toBe(0);
    const untouched = await owner.query(api.agents.get, { spaceId, agentId });
    expect(untouched?.deploymentStatus).toBe("running");

    // Now add an autoscaler-owned agent to the squad and re-run: it should be
    // the one reclaimed, not the manual one.
    const ownedId = await t.run(async (ctx) =>
      ctx.db.insert("agents", {
        companyId: untouched!.companyId,
        spaceId,
        squadId,
        kind: "hermes",
        name: "Auto Clone",
        status: "online",
        vmProvider: "cloudflare",
        vmId: "vm-auto",
        deploymentStatus: "running",
        meta: { autoscaled: true },
        createdAt: Date.now(),
      }),
    );
    const res2 = await t.action(internal.agentOps.evaluateAutoscale, {});
    expect(res2.scaled).toBe(1);
    const owned = await owner.query(api.agents.get, { spaceId, agentId: ownedId as Id<"agents"> });
    expect(owned?.deploymentStatus).toBe("stopped");
    expect(owned?.status).toBe("offline");
    const manualStillUp = await owner.query(api.agents.get, { spaceId, agentId });
    expect(manualStillUp?.deploymentStatus).toBe("running");

    // Cooldown: immediately re-evaluating should hold, not scale again.
    const res3 = await t.action(internal.agentOps.evaluateAutoscale, {});
    expect(res3.scaled).toBe(0);
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

describe("health — self-healing watchdog (feature 10)", () => {
  test("watchdogCandidatesPage only surfaces offline hosted agents that aren't disabled or backing off", async () => {
    const { t, owner, spaceId, agentId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, {
        status: "offline",
        vmProvider: "cloudflare",
        vmId: "vm-1",
      });
    });
    const page1 = await t.query(internal.health.watchdogCandidatesPage, { cursor: null });
    expect(page1.candidates.map((a: { _id: unknown }) => a._id)).toContain(agentId);

    // watchdogDisabled excludes it.
    await owner.mutation(api.health.setWatchdogDisabled, { spaceId, agentId, disabled: true });
    const page2 = await t.query(internal.health.watchdogCandidatesPage, { cursor: null });
    expect(page2.candidates.map((a: { _id: unknown }) => a._id)).not.toContain(agentId);

    // Re-enabling brings it back.
    await owner.mutation(api.health.setWatchdogDisabled, { spaceId, agentId, disabled: false });
    const page3 = await t.query(internal.health.watchdogCandidatesPage, { cursor: null });
    expect(page3.candidates.map((a: { _id: unknown }) => a._id)).toContain(agentId);

    // A future nextRestartAt (mid-backoff) excludes it too.
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { nextRestartAt: Date.now() + 60_000 });
    });
    const page4 = await t.query(internal.health.watchdogCandidatesPage, { cursor: null });
    expect(page4.candidates.map((a: { _id: unknown }) => a._id)).not.toContain(agentId);
  });

  test("recordRestartOutcome applies exponential backoff and disables the watchdog past the attempt ceiling", async () => {
    const { t, owner, spaceId, agentId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { status: "offline", vmProvider: "cloudflare", vmId: "vm-1" });
    });

    await t.mutation(internal.health.recordRestartOutcome, { agentId, outcome: "restarted" });
    let agent = await owner.query(api.agents.get, { spaceId, agentId });
    expect(agent?.restartAttempts).toBe(1);
    expect(agent?.nextRestartAt).toBeGreaterThan(Date.now());
    expect(agent?.watchdogDisabled).toBeFalsy();
    const firstBackoff = agent!.nextRestartAt! - agent!.lastRestartAt!;

    await t.mutation(internal.health.recordRestartOutcome, { agentId, outcome: "failed", error: "boom" });
    agent = await owner.query(api.agents.get, { spaceId, agentId });
    expect(agent?.restartAttempts).toBe(2);
    const secondBackoff = agent!.nextRestartAt! - agent!.lastRestartAt!;
    expect(secondBackoff).toBeGreaterThan(firstBackoff); // exponential growth

    // Drive it past the ceiling.
    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.health.recordRestartOutcome, { agentId, outcome: "failed" });
    }
    agent = await owner.query(api.agents.get, { spaceId, agentId });
    expect(agent?.watchdogDisabled).toBe(true);
    expect(agent?.nextRestartAt).toBeUndefined();

    // A "skipped_healthy" outcome (provider reports it's actually up) doesn't burn a backoff slot.
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { restartAttempts: 0, watchdogDisabled: false, nextRestartAt: undefined });
    });
    await t.mutation(internal.health.recordRestartOutcome, { agentId, outcome: "skipped_healthy" });
    agent = await owner.query(api.agents.get, { spaceId, agentId });
    expect(agent?.restartAttempts).toBe(0);
  });

  test("resetWatchdog clears backoff state and setWatchdogDisabled/resetWatchdog are admin-gated", async () => {
    const { t, owner, spaceId, agentId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, {
        restartAttempts: 4,
        watchdogDisabled: true,
        nextRestartAt: Date.now() + 60_000,
      });
    });
    await owner.mutation(api.health.resetWatchdog, { spaceId, agentId });
    const agent = await owner.query(api.agents.get, { spaceId, agentId });
    expect(agent?.restartAttempts).toBe(0);
    expect(agent?.watchdogDisabled).toBe(false);
    expect(agent?.nextRestartAt).toBeUndefined();

    const operatorId = "user_operator_watchdog";
    await owner.mutation(api.spaces.addMember, { spaceId, userId: operatorId, role: "operator" });
    const operator = t.withIdentity({ subject: operatorId, org_id: "org_ops" });
    await expect(
      operator.mutation(api.health.setWatchdogDisabled, { spaceId, agentId, disabled: true }),
    ).rejects.toThrow(/Forbidden/);
    await expect(
      operator.mutation(api.health.resetWatchdog, { spaceId, agentId }),
    ).rejects.toThrow(/Forbidden/);
  });

  test("watchdogTick is a no-op when the fleet worker isn't configured (no env vars in tests)", async () => {
    const { t, spaceId, agentId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { status: "offline", vmProvider: "cloudflare", vmId: "vm-1" });
    });
    await t.action(internal.health.watchdogTick, { cursor: null });
    const agent = await t.run((ctx) => ctx.db.get(agentId));
    // Nothing changed — unconfigured means the tick bails before touching anything.
    expect(agent?.restartAttempts ?? 0).toBe(0);
  });
});
