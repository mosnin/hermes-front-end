import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema, { DEFAULT_GUARD_CONFIG } from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

describe("alert rules engine", () => {
  test("an error-spike rule fires a notification when breached, once per cooldown", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_alert" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "A" });
    const companyId = await t.run(async (ctx) => {
      const s = await ctx.db.get(spaceId as Id<"spaces">);
      return s!.companyId;
    });

    await owner.mutation(api.alerts.create, {
      spaceId,
      name: "Error spike",
      metric: "errors_24h",
      comparator: "gt",
      threshold: 2,
      channel: "notification",
      cooldownMinutes: 30,
    });

    // No errors yet → evaluation fires nothing.
    let res = await t.mutation(internal.alerts.evaluateAll, {});
    expect(res.fired).toBe(0);

    // Seed 3 errors (over the threshold of 2).
    await t.run(async (ctx) => {
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert("errors", {
          companyId,
          spaceId: spaceId as Id<"spaces">,
          traceId: `t_${i}`,
          source: "test",
          kind: "exception",
          message: "boom",
          createdAt: Date.now(),
        });
      }
    });

    res = await t.mutation(internal.alerts.evaluateAll, {});
    expect(res.fired).toBe(1);

    // A notification was created.
    const notifs = await t.run(async (ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId as Id<"spaces">))
        .collect(),
    );
    expect(notifs.some((n) => n.type === "alert")).toBe(true);

    // Still breached, but cooldown holds → no second page.
    res = await t.mutation(internal.alerts.evaluateAll, {});
    expect(res.fired).toBe(0);
  });

  test("a rule cannot reference another tenant's bridge (isolation)", async () => {
    const t = convexTest(schema, modules);
    // Tenant B owns a bridge.
    const bOwner = t.withIdentity({ subject: "b", org_id: "org_b" });
    const bSpace = await bOwner.mutation(api.spaces.create, { name: "B" });
    await bOwner.mutation(api.billing.setPlan, { spaceId: bSpace, plan: "team" });
    const bBridge = await bOwner.mutation(api.bridges.connect, {
      spaceId: bSpace,
      type: "slack",
      name: "b-team",
    });

    // Tenant A tries to point an alert at tenant B's bridge → refused.
    const aOwner = t.withIdentity({ subject: "a", org_id: "org_a" });
    const aSpace = await aOwner.mutation(api.spaces.create, { name: "A" });
    await expect(
      aOwner.mutation(api.alerts.create, {
        spaceId: aSpace,
        name: "leak",
        metric: "errors_24h",
        comparator: "gt",
        threshold: 1,
        channel: "bridge",
        bridgeId: bBridge as Id<"bridges">,
      }),
    ).rejects.toThrow(/Bridge not found in this Space/);
  });

  test("budget rule only alerts when a budget is set", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_alert2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "B" });
    await owner.mutation(api.alerts.create, {
      spaceId,
      name: "Budget burn",
      metric: "budget_pct",
      comparator: "gt",
      threshold: 50,
      channel: "notification",
    });
    // No budget configured → metric is null → never fires.
    let res = await t.mutation(internal.alerts.evaluateAll, {});
    expect(res.fired).toBe(0);

    // Set a $1 budget and spend $1 via A2A ($0.0005 each won't hit it fast);
    // instead directly bump the usage counter to 60% by reporting usage.
    await owner.mutation(api.spaces.setGuardConfig, {
      spaceId,
      guardConfig: { ...DEFAULT_GUARD_CONFIG, monthlyBudgetUsd: 1 },
    });
    const a = await owner.action(api.agents.create, { spaceId, name: "A" });
    const companyId = await t.run(async (ctx) => {
      const s = await ctx.db.get(spaceId as Id<"spaces">);
      return s!.companyId;
    });
    await t.mutation(internal.connector.reportUsage, {
      agentId: a.agentId as Id<"agents">,
      companyId,
      spaceId,
      inputTokens: 0,
      outputTokens: 40000, // 40k * $15/1M = $0.60 = 60% of $1
    });
    res = await t.mutation(internal.alerts.evaluateAll, {});
    expect(res.fired).toBe(1);
  });
});
