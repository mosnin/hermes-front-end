import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "user_owner", org_id: "org_ledger" });
  const spaceId = await owner.mutation(api.spaces.create, { name: "Ledger" });
  return { t, owner, spaceId: spaceId as Id<"spaces"> };
}

describe("ledger — action ledger (pre-existing behavior stays intact)", () => {
  test("list/stats/revert still work after P&L additions", async () => {
    const { owner, spaceId } = await setup();
    const stats = await owner.query(api.ledger.stats, { spaceId });
    expect(stats).toEqual({ proposed: 0, executed: 0, reverted: 0, blocked: 0 });
    const list = await owner.query(api.ledger.list, { spaceId });
    expect(list).toEqual([]);
  });
});

describe("ledger — per-agent P&L", () => {
  test("attributes this month's usage cost to the right agent", async () => {
    const { t, owner, spaceId } = await setup();
    const { agentId: agentId1 } = await owner.action(api.agents.create, { spaceId, name: "A1" });
    const { agentId: agentId2 } = await owner.action(api.agents.create, { spaceId, name: "A2" });

    await t.run(async (ctx) => {
      await ctx.db.insert("usage", {
        companyId: "org_ledger",
        spaceId,
        agentId: agentId1 as Id<"agents">,
        kind: "tokens",
        costUsd: 4.5,
        inputTokens: 1000,
        outputTokens: 500,
        createdAt: Date.now(),
      });
      await ctx.db.insert("usage", {
        companyId: "org_ledger",
        spaceId,
        agentId: agentId2 as Id<"agents">,
        kind: "tokens",
        costUsd: 1.5,
        createdAt: Date.now(),
      });
    });

    const rows = await owner.query(api.ledger.pnlByAgent, { spaceId });
    const row1 = rows.find((r) => r.agentId === agentId1);
    const row2 = rows.find((r) => r.agentId === agentId2);
    expect(row1?.usageCostUsd).toBe(4.5);
    expect(row1?.inputTokens).toBe(1000);
    expect(row2?.usageCostUsd).toBe(1.5);
  });

  test("hosted-agent-hours accrue only while deploymentStatus is running", async () => {
    const { t, owner, spaceId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(spaceId, { plan: "team" }); // team plan needed for hosted deploy
    });
    const res = await owner.action(api.fleet.deploy, { spaceId, count: 1 });
    const agentId = res.deployed[0].agentId as Id<"agents">;

    // Not running yet ("provisioning") => 0 hosted hours.
    let rows = await owner.query(api.ledger.pnlByAgent, { spaceId });
    expect(rows.find((r) => r.agentId === agentId)?.hostedHours).toBe(0);

    // Backdate createdAt and flip to running => hours should be > 0.
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, {
        deploymentStatus: "running",
        createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2h ago
      });
    });
    rows = await owner.query(api.ledger.pnlByAgent, { spaceId });
    const row = rows.find((r) => r.agentId === agentId);
    expect(row?.hostedHours).toBeGreaterThan(1.9);
    expect(row?.hostedCostUsd).toBeGreaterThan(0);
  });

  test("setAttributedRevenue drives pnlUsd and pnlSummary rollup", async () => {
    const { t, owner, spaceId } = await setup();
    const { agentId } = await owner.action(api.agents.create, { spaceId, name: "Revenue agent" });
    await t.run(async (ctx) => {
      await ctx.db.insert("usage", {
        companyId: "org_ledger",
        spaceId,
        agentId: agentId as Id<"agents">,
        kind: "tokens",
        costUsd: 2,
        createdAt: Date.now(),
      });
    });

    await owner.mutation(api.ledger.setAttributedRevenue, {
      spaceId,
      agentId: agentId as Id<"agents">,
      revenueUsd: 10,
    });

    const rows = await owner.query(api.ledger.pnlByAgent, { spaceId });
    const row = rows.find((r) => r.agentId === agentId);
    expect(row?.revenueUsd).toBe(10);
    expect(row?.pnlUsd).toBe(8);

    const summary = await owner.query(api.ledger.pnlSummary, { spaceId });
    expect(summary.totalRevenueUsd).toBe(10);
    expect(summary.totalCostUsd).toBe(2);
    expect(summary.totalPnlUsd).toBe(8);
    expect(summary.profitableCount).toBe(1);
  });

  test("rejects a negative attributed revenue", async () => {
    const { owner, spaceId } = await setup();
    const { agentId } = await owner.action(api.agents.create, { spaceId, name: "A" });
    await expect(
      owner.mutation(api.ledger.setAttributedRevenue, {
        spaceId,
        agentId: agentId as Id<"agents">,
        revenueUsd: -5,
      }),
    ).rejects.toThrow(/revenueUsd/);
  });

  test("a viewer cannot set attributed revenue", async () => {
    const { t, owner, spaceId } = await setup();
    const { agentId } = await owner.action(api.agents.create, { spaceId, name: "A" });
    const viewerId = "user_ledger_viewer";
    await owner.mutation(api.spaces.addMember, { spaceId, userId: viewerId, role: "viewer" });
    const viewer = t.withIdentity({ subject: viewerId, org_id: "org_ledger" });
    await expect(
      viewer.mutation(api.ledger.setAttributedRevenue, {
        spaceId,
        agentId: agentId as Id<"agents">,
        revenueUsd: 5,
      }),
    ).rejects.toThrow(/[Ff]orbidden/);
  });
});
