import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { HARNESS_IDS } from "../../connector/harnesses/schema";
import { KNOWN_HARNESS_IDS, HARNESS_CATALOG } from "../lib/cloudflare";
import hermesManifest from "../../connector/harnesses/hermes/harness.json";
import openclawManifest from "../../connector/harnesses/openclaw/harness.json";
import gooseManifest from "../../connector/harnesses/goose/harness.json";
import genericCliManifest from "../../connector/harnesses/generic-cli/harness.json";

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

describe("fleet.deploy — harness-agnostic runtime", () => {
  test("connector/harnesses ids and convex/lib/cloudflare's mirror stay in sync", () => {
    // convex/fleet.ts can only import from convex/, so convex/lib/cloudflare.ts
    // keeps its own copy of the harness id list (see docs/HARNESS_SPEC.md step
    // 6). This test is the tripwire: it fails loudly if the two ever drift.
    const builtIn = HARNESS_IDS.filter((id) => id !== "custom").sort();
    expect([...KNOWN_HARNESS_IDS].sort()).toEqual(builtIn);
  });

  test("defaults to the hermes harness when unspecified (cloudflare unconfigured)", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");

    await owner.action(api.fleet.deploy, { spaceId, count: 1, namePrefix: "Default" });

    const fleet = await owner.query(api.fleet.list, { spaceId });
    expect(fleet).toHaveLength(1);
    expect(fleet[0].harness).toBe("hermes");
  });

  test("accepts a known non-default harness and records it on the agent", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");

    await owner.action(api.fleet.deploy, {
      spaceId,
      count: 1,
      namePrefix: "Goose",
      harness: "goose",
    });

    const fleet = await owner.query(api.fleet.list, { spaceId });
    expect(fleet).toHaveLength(1);
    expect(fleet[0].harness).toBe("goose");
  });

  test("rejects an unknown harness id", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");

    await expect(
      owner.action(api.fleet.deploy, { spaceId, count: 1, harness: "not-a-real-harness" }),
    ).rejects.toThrow(/[Uu]nknown harness/);

    const fleet = await owner.query(api.fleet.list, { spaceId });
    expect(fleet).toHaveLength(0);
  });

  test("BYO container image is rejected below the enterprise plan", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");

    await expect(
      owner.action(api.fleet.deploy, { spaceId, count: 1, imageRef: "ghcr.io/acme/custom-agent:latest" }),
    ).rejects.toThrow(/enterprise plan/);

    const fleet = await owner.query(api.fleet.list, { spaceId });
    expect(fleet).toHaveLength(0);
  });

  test("harnessCatalog mirrors connector/harnesses/*/harness.json (tripwire)", async () => {
    // convex/fleet.ts can't import connector/harnesses (cross-boundary), so
    // convex/lib/cloudflare.ts's HARNESS_CATALOG keeps its own copy of each
    // manifest's display metadata + capabilities. This fails loudly on drift.
    const manifests: Record<string, any> = {
      hermes: hermesManifest,
      openclaw: openclawManifest,
      goose: gooseManifest,
      "generic-cli": genericCliManifest,
    };
    for (const id of KNOWN_HARNESS_IDS) {
      const mirror = HARNESS_CATALOG[id];
      const real = manifests[id];
      expect(mirror.displayName).toBe(real.displayName);
      expect(mirror.version).toBe(real.version);
      expect([...mirror.capabilities].sort()).toEqual([...real.capabilities].sort());
    }
  });

  test("harnessCatalog query returns every known harness with its metadata", async () => {
    const { t, owner } = await setup();
    const catalog = await owner.query(api.fleet.harnessCatalog, {});
    expect(catalog).toHaveLength(KNOWN_HARNESS_IDS.length);
    const goose = catalog.find((c) => c.id === "goose");
    expect(goose?.displayName).toBe("Goose (Block)");
    expect(goose?.capabilities).toContain("framework:goose");
    void t;
  });

  test("deploy writes the resolved harness's capability tags onto the agent", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");

    await owner.action(api.fleet.deploy, { spaceId, count: 1, harness: "openclaw" });
    const fleet = await owner.query(api.fleet.list, { spaceId });
    expect(fleet[0].capabilities).toEqual(
      expect.arrayContaining(["chat", "workflow", "framework:openclaw"]),
    );
  });

  test("deploy defaults to hermes's capability tags when harness is unspecified", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");

    await owner.action(api.fleet.deploy, { spaceId, count: 1 });
    const fleet = await owner.query(api.fleet.list, { spaceId });
    expect(fleet[0].capabilities).toEqual(expect.arrayContaining(["chat", "workflow", "rag", "mcp"]));
  });

  test("BYO container image gets the conservative baseline capability tags", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "enterprise");

    await owner.action(api.fleet.deploy, {
      spaceId,
      count: 1,
      imageRef: "ghcr.io/acme/custom-agent:latest",
    });
    const fleet = await owner.query(api.fleet.list, { spaceId });
    expect(fleet[0].capabilities).toEqual(["chat", "workflow"]);
  });

  test("generic-cli harness is rejected without agentCommand", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");

    await expect(
      owner.action(api.fleet.deploy, { spaceId, count: 1, harness: "generic-cli" }),
    ).rejects.toThrow(/agentCommand/);

    const fleet = await owner.query(api.fleet.list, { spaceId });
    expect(fleet).toHaveLength(0);
  });

  test("generic-cli harness is rejected with a blank/whitespace-only agentCommand", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");

    await expect(
      owner.action(api.fleet.deploy, {
        spaceId,
        count: 1,
        harness: "generic-cli",
        agentCommand: "   ",
      }),
    ).rejects.toThrow(/agentCommand/);
  });

  test("generic-cli harness succeeds once agentCommand is supplied", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");

    const res = await owner.action(api.fleet.deploy, {
      spaceId,
      count: 1,
      harness: "generic-cli",
      agentCommand: "my-agent --task '{instruction}'",
    });
    expect(res.deployed).toHaveLength(1);

    const fleet = await owner.query(api.fleet.list, { spaceId });
    expect(fleet[0].harness).toBe("generic-cli");
  });

  test("BYO image deploys don't require agentCommand even without a harness match", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "enterprise");

    // No harness specified (defaults to hermes internally pre-imageRef-check)
    // and no agentCommand — imageRef deploys are exempt from the generic-cli
    // agentCommand requirement since the image is opaque to us.
    const res = await owner.action(api.fleet.deploy, {
      spaceId,
      count: 1,
      imageRef: "ghcr.io/acme/custom-agent:latest",
    });
    expect(res.deployed).toHaveLength(1);
  });

  test("BYO container image is allowed on the enterprise plan", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "enterprise");

    const res = await owner.action(api.fleet.deploy, {
      spaceId,
      count: 1,
      imageRef: "ghcr.io/acme/custom-agent:latest",
    });
    expect(res.deployed).toHaveLength(1);

    const fleet = await owner.query(api.fleet.list, { spaceId });
    expect(fleet[0].imageRef).toBe("ghcr.io/acme/custom-agent:latest");
    // Cloudflare is unconfigured in tests, so /spawn never actually ran — the
    // resolved harness still records "custom" for a BYO deploy though, since
    // that's the routing decision, independent of whether the call succeeded.
    expect(fleet[0].harness).toBe("custom");
  });
});

describe("fleet.rollingRestart — drain-aware rolling restart", () => {
  async function deployRunning(
    t: ReturnType<typeof convexTest>,
    owner: ReturnType<typeof t.withIdentity>,
    spaceId: Id<"spaces">,
  ): Promise<Id<"agents">> {
    const res = await owner.action(api.fleet.deploy, { spaceId, count: 1, namePrefix: "Restart" });
    const agentId = res.deployed[0].agentId as Id<"agents">;
    // Cloudflare is unconfigured in tests, so deploy() leaves deploymentStatus
    // "provisioning" with no vmId — force it into the "running with a vmId"
    // state rollingRestart's eligibility query looks for.
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { deploymentStatus: "running", vmId: "fake-vm-id" });
    });
    return agentId;
  }

  test("a non-operator (viewer) cannot trigger a rolling restart", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");
    await deployRunning(t, owner, spaceId);

    const viewerId = "user_restart_viewer";
    await owner.mutation(api.spaces.addMember, { spaceId, userId: viewerId, role: "viewer" });
    const viewer = t.withIdentity({ subject: viewerId, org_id: "org_fleet" });

    await expect(
      viewer.action(api.fleet.rollingRestart, { spaceId }),
    ).rejects.toThrow(/[Ff]orbidden/);
  });

  test("cloudflare unconfigured: no-op (nothing to actually restart)", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");
    await deployRunning(t, owner, spaceId);

    const res = await owner.action(api.fleet.rollingRestart, { spaceId });
    expect(res.restarted).toHaveLength(0);
    expect(res.drained).toHaveLength(0);
    expect(res.total).toBe(1);
  });

  test("drains an agent with a running runStep instead of restarting it", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");
    const agentId = await deployRunning(t, owner, spaceId);

    // Simulate an in-flight task on this agent.
    await t.run(async (ctx) => {
      const now = Date.now();
      const workflowId = await ctx.db.insert("workflows", {
        companyId: "org_fleet",
        spaceId,
        name: "wf",
        enabled: true,
        steps: [],
        createdAt: now,
        updatedAt: now,
      });
      const runId = await ctx.db.insert("workflowRuns", {
        companyId: "org_fleet",
        spaceId,
        workflowId,
        status: "running",
        hops: 0,
        stepsDone: 0,
        startedAt: now,
      });
      await ctx.db.insert("runSteps", {
        companyId: "org_fleet",
        spaceId,
        workflowRunId: runId,
        stepId: "s1",
        index: 0,
        name: "step",
        agentId,
        instruction: "do work",
        status: "running",
        attempts: 1,
        startedAt: Date.now(),
      });
    });

    const res = await owner.action(api.fleet.rollingRestart, { spaceId });
    expect(res.drained).toEqual([agentId]);
    expect(res.restarted).toHaveLength(0);

    const agent = await t.run(async (ctx) => ctx.db.get(agentId));
    expect(agent?.restartRequestedAt).toBeTypeOf("number");
  });

  test("filters candidates by harness", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");
    const agentId = await deployRunning(t, owner, spaceId); // harness defaults to "hermes"

    const gooseOnly = await owner.action(api.fleet.rollingRestart, { spaceId, harness: "goose" });
    expect(gooseOnly.total).toBe(0);

    const hermesOnly = await owner.action(api.fleet.rollingRestart, { spaceId, harness: "hermes" });
    expect(hermesOnly.total).toBe(1);
    void agentId;
  });
});

describe("fleet.pendingRestarts — rolling-restart status panel", () => {
  test("a non-operator (viewer) cannot read pending restarts", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");

    const viewerId = "user_pending_viewer";
    await owner.mutation(api.spaces.addMember, { spaceId, userId: viewerId, role: "viewer" });
    const viewer = t.withIdentity({ subject: viewerId, org_id: "org_fleet" });

    await expect(viewer.query(api.fleet.pendingRestarts, { spaceId })).rejects.toThrow(/[Ff]orbidden/);
  });

  test("lists drained agents flagged by rollingRestart, empty once cleared", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");
    const res = await owner.action(api.fleet.deploy, { spaceId, count: 1, namePrefix: "Pending" });
    const agentId = res.deployed[0].agentId as Id<"agents">;

    // Nothing pending yet.
    expect(await owner.query(api.fleet.pendingRestarts, { spaceId })).toHaveLength(0);

    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { restartRequestedAt: Date.now() });
    });

    const pending = await owner.query(api.fleet.pendingRestarts, { spaceId });
    expect(pending).toHaveLength(1);
    expect(pending[0].agentId).toBe(agentId);
    expect(pending[0].draining).toBe(false);

    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { restartRequestedAt: undefined });
    });
    expect(await owner.query(api.fleet.pendingRestarts, { spaceId })).toHaveLength(0);
  });
});

describe("fleet.sweepPendingRestarts — automatic drain-requeue", () => {
  test("built-in harness manifests all health-probe on the worker's Container.defaultPort", async () => {
    // connector/fleet-worker/src/index.ts hardcodes `defaultPort = 8080` on
    // AgentContainer; every harness.json's health.port must match it or the
    // container never reports healthy. Regression tripwire for manifest/worker
    // drift (excluded from tsc since connector/ isn't in the main tsconfig).
    const { listManifests } = await import("../../connector/harnesses/registry");
    for (const m of listManifests()) {
      expect(m.health.port).toBe(8080);
    }
  });

  test("leaves a still-draining agent's restartRequestedAt set and does not restart it", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");
    const res = await owner.action(api.fleet.deploy, { spaceId, count: 1, namePrefix: "Sweep" });
    const agentId = res.deployed[0].agentId as Id<"agents">;
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, {
        deploymentStatus: "running",
        vmId: "fake-vm-id",
        restartRequestedAt: Date.now(),
      });
      const now = Date.now();
      const workflowId = await ctx.db.insert("workflows", {
        companyId: "org_fleet",
        spaceId,
        name: "wf",
        enabled: true,
        steps: [],
        createdAt: now,
        updatedAt: now,
      });
      const runId = await ctx.db.insert("workflowRuns", {
        companyId: "org_fleet",
        spaceId,
        workflowId,
        status: "running",
        hops: 0,
        stepsDone: 0,
        startedAt: now,
      });
      await ctx.db.insert("runSteps", {
        companyId: "org_fleet",
        spaceId,
        workflowRunId: runId,
        stepId: "s1",
        index: 0,
        name: "step",
        agentId,
        instruction: "still working",
        status: "running",
        attempts: 1,
        startedAt: now,
      });
    });

    await t.action(internal.fleet.sweepPendingRestarts, {});

    const agent = await t.run(async (ctx) => ctx.db.get(agentId));
    expect(agent?.restartRequestedAt).toBeTypeOf("number");
  });

  test("cloudflare unconfigured: pending-restart agents are left untouched (no-op)", async () => {
    const { t, owner, spaceId } = await setup();
    await setPlan(t, spaceId, "team");
    const res = await owner.action(api.fleet.deploy, { spaceId, count: 1, namePrefix: "Sweep2" });
    const agentId = res.deployed[0].agentId as Id<"agents">;
    const requestedAt = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, {
        deploymentStatus: "running",
        vmId: "fake-vm-id",
        restartRequestedAt: requestedAt,
      });
    });

    await t.action(internal.fleet.sweepPendingRestarts, {});

    const agent = await t.run(async (ctx) => ctx.db.get(agentId));
    // Cloudflare is unconfigured in tests, so the sweep can't actually call
    // restartAgent() — restartRequestedAt must be left exactly as it was
    // (not silently cleared) so a real sweep once configured still catches it.
    expect(agent?.restartRequestedAt).toBe(requestedAt);
  });
});
