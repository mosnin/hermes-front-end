import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "user_owner", org_id: "org_meter_fleet" });
  const spaceId = await owner.mutation(api.spaces.create, { name: "Metered" });
  await t.run(async (ctx) => {
    await ctx.db.patch(spaceId as Id<"spaces">, { plan: "team" });
  });
  const res = await owner.action(api.fleet.deploy, {
    spaceId,
    count: 2,
    namePrefix: "Hosted",
  });
  return { t, owner, spaceId: spaceId as Id<"spaces">, deployed: res.deployed };
}

describe("fleetMetering.runHourly", () => {
  test("bills one usage row per running hosted agent, none for provisioning", async () => {
    const { t, spaceId, deployed } = await setup();

    // Cloudflare is unconfigured in this test env, so deploy leaves agents
    // "provisioning" — mark one as "running" to exercise the metering path.
    const runningAgentId = deployed[0].agentId as Id<"agents">;
    await t.run(async (ctx) => {
      await ctx.db.patch(runningAgentId, { deploymentStatus: "running" });
    });

    await t.mutation(internal.fleetMetering.runHourly, { cursor: null });

    const usage = await t.run(async (ctx) => {
      return await ctx.db
        .query("usage")
        .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
        .collect();
    });

    const hourlyRows = usage.filter((u) => u.kind === "hosted_agent_hour");
    expect(hourlyRows).toHaveLength(1);
    expect(hourlyRows[0].agentId).toBe(runningAgentId);
    expect(hourlyRows[0].costUsd).toBeGreaterThan(0);
  });

  test("is idempotent within the same hour bucket", async () => {
    const { t, spaceId, deployed } = await setup();
    const runningAgentId = deployed[0].agentId as Id<"agents">;
    await t.run(async (ctx) => {
      await ctx.db.patch(runningAgentId, { deploymentStatus: "running" });
    });

    await t.mutation(internal.fleetMetering.runHourly, { cursor: null });
    await t.mutation(internal.fleetMetering.runHourly, { cursor: null });

    const usage = await t.run(async (ctx) => {
      return await ctx.db
        .query("usage")
        .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
        .collect();
    });
    const hourlyRows = usage.filter((u) => u.kind === "hosted_agent_hour");
    expect(hourlyRows).toHaveLength(1);
  });
});

describe("stripe.lapseHostedFleet", () => {
  test("marks all fleet-deployed agents in the Space stopped", async () => {
    const { t, spaceId, deployed } = await setup();

    // Sanity: agents start out not-stopped (provisioning, since cloudflare is
    // unconfigured in this test env).
    const before = await t.run(async (ctx) => {
      return await Promise.all(
        deployed.map((d) => ctx.db.get(d.agentId as Id<"agents">)),
      );
    });
    expect(before.every((a) => a?.deploymentStatus !== "stopped")).toBe(true);

    await t.mutation(internal.stripe.lapseHostedFleet, {
      spaceId,
      stripeEvent: "evt_test_subscription_deleted",
    });

    const after = await t.run(async (ctx) => {
      return await Promise.all(
        deployed.map((d) => ctx.db.get(d.agentId as Id<"agents">)),
      );
    });
    for (const a of after) {
      expect(a?.deploymentStatus).toBe("stopped");
      expect(a?.status).toBe("offline");
    }
  });
});
