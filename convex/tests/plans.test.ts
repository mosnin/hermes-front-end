import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema, { DEFAULT_GUARD_CONFIG } from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

describe("plan enforcement", () => {
  test("free plan caps agents at 3; upgrade lifts the ceiling", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_plan" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "P" });

    // Free plan = 3 agents. Three succeed.
    for (let i = 0; i < 3; i++) {
      await owner.action(api.agents.create, { spaceId, name: `a${i}` });
    }
    // Fourth is refused.
    await expect(
      owner.action(api.agents.create, { spaceId, name: "a4" }),
    ).rejects.toThrow(/limit reached for the free plan/);

    // Upgrade to enterprise and the next agent is allowed.
    await owner.mutation(api.billing.setPlan, { spaceId, plan: "enterprise" });
    const created = await owner.action(api.agents.create, {
      spaceId,
      name: "a5",
    });
    expect(created.agentId).toBeDefined();
  });

  test("bridges are a paid feature — free plan is refused", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_plan2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "P2" });
    await expect(
      owner.mutation(api.bridges.connect, {
        spaceId,
        type: "slack",
        name: "team",
      }),
    ).rejects.toThrow(/requires a higher plan/);

    await owner.mutation(api.billing.setPlan, { spaceId, plan: "team" });
    const id = await owner.mutation(api.bridges.connect, {
      spaceId,
      type: "slack",
      name: "team",
    });
    expect(id).toBeDefined();
  });

  test("entitlements reflect real usage vs the plan limit", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_plan3" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "P3" });
    await owner.action(api.agents.create, { spaceId, name: "one" });
    const ent = await owner.query(api.billing.entitlements, { spaceId });
    expect(ent.plan).toBe("free");
    expect(ent.limits.maxAgents).toBe(3);
    expect(ent.usage.agents).toBe(1);
  });
});

describe("structured error capture", () => {
  test("captured errors are queryable and correlate by trace id", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_obs" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Obs" });
    const companyId = await t.run(async (ctx) => {
      const s = await ctx.db.get(spaceId as Id<"spaces">);
      return s!.companyId;
    });

    // The gateway records via this separate-transaction capture (an in-mutation
    // write would roll back with the failing request).
    const traceId = await t.mutation(internal.observability.capture, {
      companyId,
      spaceId,
      source: "a2a",
      kind: "guard_violation",
      message: "GuardViolation: rate limit: 1 messages/minute",
    });

    const errors = await owner.query(api.observability.listErrors, { spaceId });
    expect(errors.length).toBe(1);
    expect(errors[0].kind).toBe("guard_violation");
    expect(errors[0].traceId).toMatch(/^t_/);

    const correlated = await owner.query(api.observability.byTrace, {
      spaceId,
      traceId,
    });
    expect(correlated.length).toBe(1);
    expect(await owner.query(api.observability.recentErrorCount, { spaceId })).toBe("1");
  });
});
