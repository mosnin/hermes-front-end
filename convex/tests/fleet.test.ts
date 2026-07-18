import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "user_owner", org_id: "org_fleet" });
  const spaceId = await owner.mutation(api.spaces.create, { name: "Fleet" });
  return { t, owner, spaceId: spaceId as Id<"spaces"> };
}

async function setPlan(t: ReturnType<typeof convexTest>, spaceId: Id<"spaces">, plan: string) {
  await t.run(async (ctx) => {
    await ctx.db.patch(spaceId, { plan });
  });
}

describe("fleet.deploy — managed hosting", () => {
  test("cloudflare unconfigured: deploy still creates agents, status 'provisioning'", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");

    const res = await owner.action(api.fleet.deploy, {
      spaceId,
      count: 2,
      namePrefix: "Worker",
    });

    expect(res.cloudflare).toBe(false);
    expect(res.deployed).toHaveLength(2);

    const fleet = await owner.query(api.fleet.list, { spaceId });
    expect(fleet).toHaveLength(2);
    for (const a of fleet) {
      expect(a.vmProvider).toBe("cloudflare");
      expect(a.deploymentStatus).toBe("provisioning");
    }
  });

  test("blocked once the plan's hostedAgents limit is reached", async () => {
    const { t, owner, spaceId } = await setup();
    // free plan => hostedAgents limit is 0.
    await setPlan(t, spaceId, "free");

    await expect(
      owner.action(api.fleet.deploy, { spaceId, count: 1 }),
    ).rejects.toThrow(/[Hh]osted agent limit/);

    const fleet = await owner.query(api.fleet.list, { spaceId });
    expect(fleet).toHaveLength(0);
  });

  test("allowed under the limit, blocked once it's crossed", async () => {
    const { t, owner, spaceId } = await setup();
    // team plan => hostedAgents limit is 5.
    await setPlan(t, spaceId, "team");

    // Deploy 5 — exactly at the limit — succeeds.
    const first = await owner.action(api.fleet.deploy, { spaceId, count: 5 });
    expect(first.deployed).toHaveLength(5);

    // A 6th would cross the limit (5 existing + 1 requested > 5).
    await expect(
      owner.action(api.fleet.deploy, { spaceId, count: 1 }),
    ).rejects.toThrow(/[Hh]osted agent limit/);

    const fleet = await owner.query(api.fleet.list, { spaceId });
    expect(fleet).toHaveLength(5);
  });

  test("a non-operator (viewer) cannot deploy", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");

    const viewerId = "user_viewer";
    await owner.mutation(api.spaces.addMember, {
      spaceId,
      userId: viewerId,
      role: "viewer",
    });
    const viewer = t.withIdentity({ subject: viewerId, org_id: "org_fleet" });

    await expect(
      viewer.action(api.fleet.deploy, { spaceId, count: 1 }),
    ).rejects.toThrow(/[Ff]orbidden/);
  });
});
