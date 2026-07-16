import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema, { DEFAULT_GUARD_CONFIG } from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

describe("cost forecast + anomaly detection", () => {
  test("projects month-end spend from month-to-date and flags over-budget", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_fc" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "F" });
    await owner.mutation(api.spaces.setGuardConfig, {
      spaceId,
      guardConfig: { ...DEFAULT_GUARD_CONFIG, monthlyBudgetUsd: 100 },
    });
    const a = await owner.action(api.agents.create, { spaceId, name: "A" });
    const companyId = await t.run(async (ctx) => {
      const s = await ctx.db.get(spaceId as Id<"spaces">);
      return s!.companyId;
    });
    // Report $5 of real spend so far this month.
    await t.mutation(internal.connector.reportUsage, {
      agentId: a.agentId as Id<"agents">,
      companyId,
      spaceId,
      inputTokens: 0,
      outputTokens: 333_333, // ~$5 at $15/1M
      costUsd: 5,
    });

    const fc = await owner.query(api.metrics.forecast, { spaceId });
    expect(fc.mtdSpendUsd).toBeCloseTo(5, 2);
    // Projection = mtd / dayOfMonth * daysInMonth ≥ mtd, and consistent.
    expect(fc.projectedSpendUsd).toBeGreaterThanOrEqual(5);
    const expected = (5 / fc.dayOfMonth) * fc.daysInMonth;
    expect(fc.projectedSpendUsd).toBeCloseTo(Math.round(expected * 100) / 100, 2);
    expect(fc.budgetUsd).toBe(100);
  });

  test("error anomaly fires when today spikes over the trailing baseline", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_fc2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "F2" });
    const companyId = await t.run(async (ctx) => {
      const s = await ctx.db.get(spaceId as Id<"spaces">);
      return s!.companyId;
    });

    // 6 errors today, none in prior days → clear anomaly.
    await t.run(async (ctx) => {
      for (let i = 0; i < 6; i++) {
        await ctx.db.insert("errors", {
          companyId,
          spaceId: spaceId as Id<"spaces">,
          traceId: `t_${i}`,
          source: "test",
          kind: "exception",
          message: "spike",
          createdAt: Date.now(),
        });
      }
    });
    const fc = await owner.query(api.metrics.forecast, { spaceId });
    expect(fc.errorsToday).toBe(6);
    expect(fc.anomaly).toBe(true);
  });
});
