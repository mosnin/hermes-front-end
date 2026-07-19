import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "user_owner", org_id: "org_costs" });
  const spaceId = await owner.mutation(api.spaces.create, { name: "Costs" });
  await t.run(async (ctx) => {
    await ctx.db.patch(spaceId, { plan: "team" });
  });
  return { t, owner, spaceId: spaceId as Id<"spaces"> };
}

async function deployHosted(
  t: ReturnType<typeof convexTest>,
  owner: ReturnType<typeof t.withIdentity>,
  spaceId: Id<"spaces">,
  name = "Hosted",
): Promise<Id<"agents">> {
  const res = await owner.action(api.fleet.deploy, { spaceId, count: 1, namePrefix: name });
  const agentId = res.deployed[0].agentId as Id<"agents">;
  // Cloudflare is unconfigured in tests; force "running" with a vmId so
  // idle/spend-cap sweeps have something to act on.
  await t.run(async (ctx) => {
    await ctx.db.patch(agentId, { deploymentStatus: "running", vmId: `vm-${agentId}` });
  });
  return agentId;
}

describe("costs — cost policy CRUD", () => {
  test("admin can set policy; operator cannot", async () => {
    const { t, owner, spaceId } = await setup();
    await owner.mutation(api.costs.setCostPolicy, {
      spaceId,
      hibernationEnabled: true,
      idleHibernateMinutes: 15,
    });
    const policy = await owner.query(api.costs.getCostPolicy, { spaceId });
    expect(policy?.hibernationEnabled).toBe(true);
    expect(policy?.idleHibernateMinutes).toBe(15);

    const opId = "user_costs_operator";
    await owner.mutation(api.spaces.addMember, { spaceId, userId: opId, role: "operator" });
    const operator = t.withIdentity({ subject: opId, org_id: "org_costs" });
    await expect(
      operator.mutation(api.costs.setCostPolicy, { spaceId, hardCapUsd: 100 }),
    ).rejects.toThrow(/[Ff]orbidden/);
  });

  test("rejects an idle threshold under 5 minutes", async () => {
    const { owner, spaceId } = await setup();
    await expect(
      owner.mutation(api.costs.setCostPolicy, { spaceId, idleHibernateMinutes: 1 }),
    ).rejects.toThrow(/idleHibernateMinutes/);
  });
});

describe("costs — idle hibernation sweep", () => {
  test("marks a stale hosted agent idle, then hibernated (VM stopped) once past 2x threshold", async () => {
    const { t, owner, spaceId } = await setup();
    await owner.mutation(api.costs.setCostPolicy, {
      spaceId,
      hibernationEnabled: true,
      idleHibernateMinutes: 10,
    });
    const agentId = await deployHosted(t, owner, spaceId);

    // Backdate lastHeartbeat so the agent looks idle for 11 minutes (> 10, < 20).
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { lastHeartbeat: Date.now() - 11 * 60_000 });
    });
    await t.action(internal.costs.sweepIdleHibernation, {});

    let agent = await owner.query(api.agents.get, { spaceId, agentId });
    expect(agent?.idleState).toBe("idle");
    expect(agent?.deploymentStatus).toBe("running"); // not hibernated yet

    // Backdate further so it's now past 2x (20 min).
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { lastHeartbeat: Date.now() - 25 * 60_000 });
    });
    await t.action(internal.costs.sweepIdleHibernation, {});

    agent = await owner.query(api.agents.get, { spaceId, agentId });
    expect(agent?.idleState).toBe("hibernated");
    expect(agent?.hibernatedAt).toBeTypeOf("number");
  });

  test("hibernationExempt agents are never touched", async () => {
    const { t, owner, spaceId } = await setup();
    await owner.mutation(api.costs.setCostPolicy, {
      spaceId,
      hibernationEnabled: true,
      idleHibernateMinutes: 5,
    });
    const agentId = await deployHosted(t, owner, spaceId, "Exempt");
    await owner.mutation(api.costs.setHibernationExempt, { spaceId, agentId, exempt: true });
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { lastHeartbeat: Date.now() - 60 * 60_000 });
    });

    await t.action(internal.costs.sweepIdleHibernation, {});

    const agent = await owner.query(api.agents.get, { spaceId, agentId });
    expect(agent?.idleState ?? "active").toBe("active");
  });

  test("wakeAgent flips idleState back to active", async () => {
    const { t, owner, spaceId } = await setup();
    const agentId = await deployHosted(t, owner, spaceId);
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { idleState: "hibernated", hibernatedAt: Date.now() });
    });
    await owner.mutation(api.costs.wakeAgent, { spaceId, agentId });
    const agent = await owner.query(api.agents.get, { spaceId, agentId });
    expect(agent?.idleState).toBe("active");
    expect(agent?.hibernatedAt).toBeUndefined();
  });
});

describe("costs — hard spend cap enforcement", () => {
  test("pauses autonomy once month-to-date spend reaches the cap", async () => {
    const { t, owner, spaceId } = await setup();
    await owner.mutation(api.costs.setCostPolicy, {
      spaceId,
      hardCapUsd: 10,
      hardCapAction: "pause",
    });

    // Bump the monthly usage counter directly (mirrors what recordUsage does).
    await t.run(async (ctx) => {
      const now = Date.now();
      const d = new Date(now);
      const monthBucket = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      await ctx.db.insert("counters", {
        companyId: "org_costs",
        spaceId,
        scope: "usage",
        bucket: monthBucket,
        count: 1,
        valueUsd: 15,
        updatedAt: now,
      });
    });

    await t.action(internal.costs.enforceSpendCaps, {});

    const space = await t.run(async (ctx) => ctx.db.get(spaceId));
    expect(space?.autonomyPaused).toBe(true);
  });

  test("stop_vms action also stops hosted agents", async () => {
    const { t, owner, spaceId } = await setup();
    await owner.mutation(api.costs.setCostPolicy, {
      spaceId,
      hardCapUsd: 5,
      hardCapAction: "stop_vms",
    });
    const agentId = await deployHosted(t, owner, spaceId);

    await t.run(async (ctx) => {
      const now = Date.now();
      const d = new Date(now);
      const monthBucket = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      await ctx.db.insert("counters", {
        companyId: "org_costs",
        spaceId,
        scope: "usage",
        bucket: monthBucket,
        count: 1,
        valueUsd: 9,
        updatedAt: now,
      });
    });

    await t.action(internal.costs.enforceSpendCaps, {});

    const agent = await owner.query(api.agents.get, { spaceId, agentId });
    expect(agent?.deploymentStatus).toBe("stopped");
    const space = await t.run(async (ctx) => ctx.db.get(spaceId));
    expect(space?.autonomyPaused).toBe(true);
  });

  test("per-agent spendCapUsd stops just that agent from usage rows", async () => {
    const { t, owner, spaceId } = await setup();
    const agentId = await deployHosted(t, owner, spaceId, "Capped");
    await owner.mutation(api.costs.setAgentSpendCap, { spaceId, agentId, spendCapUsd: 2 });

    await t.run(async (ctx) => {
      await ctx.db.insert("usage", {
        companyId: "org_costs",
        spaceId,
        agentId,
        kind: "tokens",
        costUsd: 3,
        createdAt: Date.now(),
      });
    });

    await t.action(internal.costs.enforceSpendCaps, {});

    const agent = await owner.query(api.agents.get, { spaceId, agentId });
    expect(agent?.deploymentStatus).toBe("stopped");
  });
});

describe("costs — spendTrend", () => {
  test("buckets real usage.costUsd rows by UTC day, filling gaps with zero", async () => {
    const { t, owner, spaceId } = await setup();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    await t.run(async (ctx) => {
      // Today: two rows, should sum.
      await ctx.db.insert("usage", {
        companyId: "org_costs",
        spaceId,
        kind: "tokens",
        costUsd: 1.5,
        createdAt: now,
      });
      await ctx.db.insert("usage", {
        companyId: "org_costs",
        spaceId,
        kind: "tokens",
        costUsd: 0.25,
        createdAt: now - 1000,
      });
      // 5 days ago: one row.
      await ctx.db.insert("usage", {
        companyId: "org_costs",
        spaceId,
        kind: "tokens",
        costUsd: 4,
        createdAt: now - 5 * dayMs,
      });
      // Outside the 30-day window: must not be counted.
      await ctx.db.insert("usage", {
        companyId: "org_costs",
        spaceId,
        kind: "tokens",
        costUsd: 999,
        createdAt: now - 40 * dayMs,
      });
    });

    const trend = await owner.query(api.costs.spendTrend, { spaceId, days: 30 });
    expect(trend).toHaveLength(30);

    const totalCost = trend.reduce((s, d) => s + d.costUsd, 0);
    expect(totalCost).toBeCloseTo(5.75, 4);

    const todayKey = new Date(now).toISOString().slice(0, 10);
    const today = trend.find((d) => d.date === todayKey);
    expect(today?.costUsd).toBeCloseTo(1.75, 4);
    expect(today?.events).toBe(2);

    const fiveDaysAgoKey = new Date(now - 5 * dayMs).toISOString().slice(0, 10);
    const fiveDaysAgo = trend.find((d) => d.date === fiveDaysAgoKey);
    expect(fiveDaysAgo?.costUsd).toBeCloseTo(4, 4);

    // A day with no usage still appears, at zero.
    const zeroDays = trend.filter((d) => d.costUsd === 0);
    expect(zeroDays.length).toBeGreaterThan(0);
  });

  test("clamps days to [1, 90] and defaults to 30", async () => {
    const { t, owner, spaceId } = await setup();
    void t;
    const clampedHigh = await owner.query(api.costs.spendTrend, { spaceId, days: 1000 });
    expect(clampedHigh).toHaveLength(90);
    const clampedLow = await owner.query(api.costs.spendTrend, { spaceId, days: 0 });
    expect(clampedLow).toHaveLength(1);
    const defaulted = await owner.query(api.costs.spendTrend, { spaceId });
    expect(defaulted).toHaveLength(30);
  });

  test("requires Space membership", async () => {
    const { t, owner, spaceId } = await setup();
    void owner;
    const stranger = t.withIdentity({ subject: "user_stranger", org_id: "org_other" });
    await expect(stranger.query(api.costs.spendTrend, { spaceId, days: 7 })).rejects.toThrow();
  });
});
