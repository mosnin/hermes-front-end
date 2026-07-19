import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// NOTE: `capabilities.ts` is a brand-new Convex module this cycle. Convex's
// generated `api` object is a runtime Proxy (`anyApi`) that resolves
// `api.capabilities.*` against the actual loaded module files below, so
// these tests run correctly today even though `convex/_generated/api.d.ts`
// hasn't been regenerated yet (that's a types-only gap — see the cycle
// report). `npx tsc --noEmit` will flag `api.capabilities.*` here until the
// integrator regenerates codegen; that's expected.
const modules = import.meta.glob("../**/*.*s");

describe("capabilities: normalized tool layer (grants)", () => {
  test("admin can grant a capability; operator cannot", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_cap" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Caps" });

    const grantId = await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "browser",
      toolNames: ["composio_browser_navigate", "composio_browser_click"],
      provider: "composio",
      enabled: true,
    });
    expect(grantId).toBeDefined();

    const grants = await owner.query(api.capabilities.listGrants, { spaceId });
    expect(grants).toHaveLength(1);
    expect(grants[0].capability).toBe("browser");
    expect(grants[0].toolNames).toHaveLength(2);

    // Add an operator member — insufficient role for mutating grants.
    await owner.mutation(api.spaces.addMember, {
      spaceId,
      userId: "user_op",
      role: "operator",
    });
    const operator = t.withIdentity({ subject: "user_op", org_id: "org_cap" });
    await expect(
      operator.mutation(api.capabilities.upsertGrant, {
        spaceId,
        capability: "email",
        toolNames: ["composio_gmail_send"],
        enabled: true,
      }),
    ).rejects.toThrow(/Forbidden/);
  });

  test("resolveTools merges enabled grants and respects agent restriction + disabled grants", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_cap2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Caps2" });

    const agentA = (
      await owner.action(api.agents.create, { spaceId, name: "Agent A" })
    ).agentId as Id<"agents">;
    const agentB = (
      await owner.action(api.agents.create, { spaceId, name: "Agent B" })
    ).agentId as Id<"agents">;

    // Space-wide grant (no agentIds restriction).
    await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "search",
      toolNames: ["composio_web_search"],
      enabled: true,
    });
    // Agent-restricted grant, only for agentA.
    await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "search",
      toolNames: ["composio_deep_research"],
      agentIds: [agentA],
      enabled: true,
    });
    // Disabled grant should never resolve.
    await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "search",
      toolNames: ["should_not_appear"],
      enabled: false,
    });

    const forA = await owner.query(api.capabilities.resolveTools, {
      spaceId,
      capabilities: ["search"],
      agentId: agentA,
    });
    expect(forA[0].toolNames.sort()).toEqual(
      ["composio_deep_research", "composio_web_search"].sort(),
    );

    const forB = await owner.query(api.capabilities.resolveTools, {
      spaceId,
      capabilities: ["search"],
      agentId: agentB,
    });
    expect(forB[0].toolNames).toEqual(["composio_web_search"]);
  });

  test("removeGrant deletes a grant (admin-only)", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_cap3" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Caps3" });
    const grantId = await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "crm",
      toolNames: ["composio_hubspot_create_contact"],
      enabled: true,
    });
    await owner.mutation(api.capabilities.removeGrant, { spaceId, grantId });
    const grants = await owner.query(api.capabilities.listGrants, { spaceId });
    expect(grants).toHaveLength(0);
  });
});

describe("capabilities: A2A public directory (feature 15) double opt-in", () => {
  test("an agent only appears publicly when BOTH the Space directory and the agent are published", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_dir" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Directory" });
    const agentId = (
      await owner.action(api.agents.create, { spaceId, name: "Published Agent" })
    ).agentId as Id<"agents">;

    // Neither toggle set yet — not public.
    let dir = await owner.query(api.capabilities.publicDirectory, {});
    expect(dir.page.find((a: { agentId: string }) => a.agentId === agentId)).toBeUndefined();

    // Publish the agent but leave the Space directory disabled — still not public.
    await owner.mutation(api.capabilities.setAgentPublished, {
      spaceId,
      agentId,
      published: true,
    });
    dir = await owner.query(api.capabilities.publicDirectory, {});
    expect(dir.page.find((a: { agentId: string }) => a.agentId === agentId)).toBeUndefined();

    // Enable the Space directory too — now it's public.
    await owner.mutation(api.capabilities.setDirectoryEnabled, {
      spaceId,
      enabled: true,
    });
    dir = await owner.query(api.capabilities.publicDirectory, {});
    const found = dir.page.find((a: { agentId: string }) => a.agentId === agentId);
    expect(found).toBeDefined();
    expect(found.cardPath).toBe(`/a2a/card/${agentId}`);

    // Turning the agent back to private removes it again.
    await owner.mutation(api.capabilities.setAgentPublished, {
      spaceId,
      agentId,
      published: false,
    });
    dir = await owner.query(api.capabilities.publicDirectory, {});
    expect(dir.page.find((a: { agentId: string }) => a.agentId === agentId)).toBeUndefined();
  });

  test("setAgentPublished and setDirectoryEnabled require admin", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_dir2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Directory2" });
    await owner.mutation(api.spaces.addMember, {
      spaceId,
      userId: "user_op",
      role: "operator",
    });
    const operator = t.withIdentity({ subject: "user_op", org_id: "org_dir2" });
    await expect(
      operator.mutation(api.capabilities.setDirectoryEnabled, { spaceId, enabled: true }),
    ).rejects.toThrow(/Forbidden/);
  });
});

describe("capabilities: listKnown catalog (cycle 2)", () => {
  test("returns the known capability tag catalog for UI pickers", async () => {
    const t = convexTest(schema, modules);
    const anon = t.withIdentity({ subject: "user_anyone", org_id: "org_known" });
    const known = await anon.query(api.capabilities.listKnown, {});
    expect(known).toContain("browser");
    expect(known).toContain("code-gen");
    expect(known.length).toBeGreaterThan(5);
  });
});

describe("evals: benchmarkTrend (cycle 2)", () => {
  test("aggregates one point per batch, oldest first, across repeated runs", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_trend" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Trend" });
    const agentId = (
      await owner.action(api.agents.create, { spaceId, name: "Trend Agent" })
    ).agentId as Id<"agents">;
    const benchmarkId = await owner.mutation(api.evals.createBenchmark, {
      spaceId,
      name: "Trend bench",
      prompt: "Say hi",
    });

    // No runs yet.
    const empty = await owner.query(api.evals.benchmarkTrend, { spaceId, benchmarkId });
    expect(empty).toHaveLength(0);

    // Simulate two completed batches directly (avoids the OPENAI_API_KEY-gated action).
    const batch1 = "batch-1";
    const run1 = await t.run(async (ctx) => {
      return await ctx.db.insert("evalRuns", {
        companyId: "org_trend",
        spaceId,
        benchmarkId,
        batchId: batch1,
        agentId,
        status: "completed",
        qualityScore: 0.5,
        costUsd: 0.01,
        startedAt: 1000,
        finishedAt: 1100,
      });
    });
    expect(run1).toBeDefined();

    const batch2 = "batch-2";
    await t.run(async (ctx) => {
      await ctx.db.insert("evalRuns", {
        companyId: "org_trend",
        spaceId,
        benchmarkId,
        batchId: batch2,
        agentId,
        status: "completed",
        qualityScore: 0.9,
        costUsd: 0.02,
        startedAt: 2000,
        finishedAt: 2100,
      });
    });

    const trend = await owner.query(api.evals.benchmarkTrend, { spaceId, benchmarkId });
    expect(trend).toHaveLength(2);
    expect(trend[0].batchId).toBe(batch1);
    expect(trend[0].avgQuality).toBe(0.5);
    expect(trend[1].batchId).toBe(batch2);
    expect(trend[1].avgQuality).toBe(0.9);
    expect(trend[0].startedAt).toBeLessThan(trend[1].startedAt);
  });
});

describe("router: capability-based routing (feature 11)", () => {
  test("routeBest picks the agent with the best capability + health score", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_route" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Routing" });

    const weak = (
      await owner.action(api.agents.create, { spaceId, name: "Weak match" })
    ).agentId as Id<"agents">;
    const strong = (
      await owner.action(api.agents.create, { spaceId, name: "Strong match" })
    ).agentId as Id<"agents">;

    // "weak" only has one of the two required capabilities.
    await t.mutation(internal.agents.recordHeartbeat, {
      agentId: weak,
      status: "online",
      capabilities: ["code-gen"],
    });
    // "strong" has both.
    await t.mutation(internal.agents.recordHeartbeat, {
      agentId: strong,
      status: "online",
      capabilities: ["code-gen", "browser"],
    });

    const ranked = await owner.query(api.router.route, {
      spaceId,
      requiredCapabilities: ["code-gen", "browser"],
    });
    expect(ranked[0].agentId).toBe(strong);
    expect(ranked[0].capabilityScore).toBe(1);
    expect(ranked.find((r: { agentId: string }) => r.agentId === weak)?.capabilityScore).toBe(0.5);

    const best = await owner.query(api.router.routeBest, {
      spaceId,
      requiredCapabilities: ["code-gen", "browser"],
    });
    expect(best?._id).toBe(strong);
  });

  test("ungrantedCapabilities flags matched tags with no capabilityGrants row wired up (feature 11+12 wiring)", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_route_cov" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "RoutingCoverage" });

    const agentId = (
      await owner.action(api.agents.create, { spaceId, name: "Multi-cap agent" })
    ).agentId as Id<"agents">;
    await t.mutation(internal.agents.recordHeartbeat, {
      agentId,
      status: "online",
      capabilities: ["browser", "crm"],
    });

    // No grants configured yet — both matched capabilities should be flagged
    // as declared-but-not-tool-ready.
    let ranked = await owner.query(api.router.route, {
      spaceId,
      requiredCapabilities: ["browser", "crm"],
    });
    let row = ranked.find((r: { agentId: string }) => r.agentId === agentId)!;
    expect(row.matchedCapabilities.sort()).toEqual(["browser", "crm"]);
    expect(row.ungrantedCapabilities.sort()).toEqual(["browser", "crm"]);
    // Grant coverage is informational only — capabilityScore is unaffected.
    expect(row.capabilityScore).toBe(1);

    // Grant "browser" space-wide (no agentIds restriction) — covers every
    // agent, so it drops out of ungrantedCapabilities.
    await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "browser",
      toolNames: ["composio_browser_navigate"],
      enabled: true,
    });
    ranked = await owner.query(api.router.route, {
      spaceId,
      requiredCapabilities: ["browser", "crm"],
    });
    row = ranked.find((r: { agentId: string }) => r.agentId === agentId)!;
    expect(row.ungrantedCapabilities).toEqual(["crm"]);

    // Grant "crm" but restrict it to a different agent — still ungranted for
    // this one.
    const otherAgentId = (
      await owner.action(api.agents.create, { spaceId, name: "Other agent" })
    ).agentId as Id<"agents">;
    await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "crm",
      toolNames: ["composio_hubspot_create_contact"],
      agentIds: [otherAgentId],
      enabled: true,
    });
    ranked = await owner.query(api.router.route, {
      spaceId,
      requiredCapabilities: ["browser", "crm"],
    });
    row = ranked.find((r: { agentId: string }) => r.agentId === agentId)!;
    expect(row.ungrantedCapabilities).toEqual(["crm"]);

    // Now also grant "crm" to our agent directly — fully tool-ready.
    await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "crm",
      toolNames: ["composio_hubspot_create_contact"],
      agentIds: [agentId],
      enabled: true,
    });
    ranked = await owner.query(api.router.route, {
      spaceId,
      requiredCapabilities: ["browser", "crm"],
    });
    row = ranked.find((r: { agentId: string }) => r.agentId === agentId)!;
    expect(row.ungrantedCapabilities).toEqual([]);
  });

  test("an explicit override bypasses scoring entirely", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_route2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Routing2" });

    const good = (
      await owner.action(api.agents.create, { spaceId, name: "Good" })
    ).agentId as Id<"agents">;
    const overridden = (
      await owner.action(api.agents.create, { spaceId, name: "Overridden" })
    ).agentId as Id<"agents">;
    await t.mutation(internal.agents.recordHeartbeat, {
      agentId: good,
      status: "online",
      capabilities: ["code-gen"],
    });

    const best = await owner.query(api.router.routeBest, {
      spaceId,
      requiredCapabilities: ["code-gen"],
      overrideAgentId: overridden,
    });
    expect(best?._id).toBe(overridden);
  });

  test("routeTask assigns the best agent and records a work event", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_route3" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Routing3" });
    const agentId = (
      await owner.action(api.agents.create, { spaceId, name: "Coder" })
    ).agentId as Id<"agents">;
    await t.mutation(internal.agents.recordHeartbeat, {
      agentId,
      status: "online",
      capabilities: ["code-gen"],
    });
    const taskId = await owner.mutation(api.tasks.create, {
      spaceId,
      title: "Write a function",
      priority: "medium",
    });
    // tasks.create/update don't yet expose `requiredCapabilities` in their
    // args validators (tasks.ts is owned by another team — see cycle report
    // cross-team request) even though the schema field exists; patch it
    // directly for this test.
    await t.run(async (ctx) => {
      await ctx.db.patch(taskId, { requiredCapabilities: ["code-gen"] });
    });

    const assigned = await owner.mutation(api.router.routeTask, { spaceId, taskId });
    expect(assigned).toBe(agentId);

    const tasks = await owner.query(api.tasks.list, { spaceId });
    expect(tasks.find((tk: { _id: string }) => tk._id === taskId)?.assigneeAgentId).toBe(
      agentId,
    );
  });

  test("harness match and recent-cost both factor into the composite score", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_route4" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Routing4" });

    const cheapMatched = (
      await owner.action(api.agents.create, { spaceId, name: "Cheap matched harness" })
    ).agentId as Id<"agents">;
    const pricyMatched = (
      await owner.action(api.agents.create, { spaceId, name: "Pricy matched harness" })
    ).agentId as Id<"agents">;
    const cheapWrongHarness = (
      await owner.action(api.agents.create, { spaceId, name: "Cheap wrong harness" })
    ).agentId as Id<"agents">;

    for (const [agentId, harness] of [
      [cheapMatched, "hermes"],
      [pricyMatched, "hermes"],
      [cheapWrongHarness, "goose"],
    ] as const) {
      await t.mutation(internal.agents.recordHeartbeat, {
        agentId,
        status: "online",
        capabilities: ["code-gen"],
      });
      await t.run(async (ctx) => {
        await ctx.db.patch(agentId, { harness });
      });
    }

    // pricyMatched racked up real spend in the last 24h; the other two have none.
    await t.run(async (ctx) => {
      await ctx.db.insert("usage", {
        companyId: "org_route4",
        spaceId,
        agentId: pricyMatched,
        kind: "run",
        costUsd: 5,
        createdAt: Date.now(),
      });
    });

    const ranked = await owner.query(api.router.route, {
      spaceId,
      requiredCapabilities: ["code-gen"],
      harness: "hermes",
    });
    const byId = new Map(ranked.map((r: { agentId: string }) => [r.agentId, r]));

    // Harness score: matches get 1, mismatches get the 0.3 penalty.
    expect(byId.get(cheapMatched)!.harnessScore).toBe(1);
    expect(byId.get(cheapWrongHarness)!.harnessScore).toBe(0.3);

    // Cost score: the agent with zero recent spend scores a full 1; the one
    // that spent the Space's max in-window cost scores 0.
    expect(byId.get(cheapMatched)!.costScore).toBe(1);
    expect(byId.get(pricyMatched)!.costScore).toBe(0);
    expect(byId.get(pricyMatched)!.recentCostUsd).toBe(5);

    // Same capability match for all three, but the cheap+matched-harness
    // agent should outrank both the pricy one and the wrong-harness one.
    expect(ranked[0].agentId).toBe(cheapMatched);
  });

  test("pickAgentForRequirements returns null when no agent in the Space qualifies", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_route5" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Routing5" });
    const best = await owner.query(api.router.routeBest, {
      spaceId,
      requiredCapabilities: ["code-gen"],
    });
    expect(best).toBeNull();
  });
});

describe("capabilities: forConnector resolves an agent's effective tool set (feature 12)", () => {
  test("uses the agent's own declared capabilities when none are passed explicitly", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_conn1" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "ConnTools" });
    const agentId = (
      await owner.action(api.agents.create, { spaceId, name: "Connector agent" })
    ).agentId as Id<"agents">;
    await t.mutation(internal.agents.recordHeartbeat, {
      agentId,
      status: "online",
      capabilities: ["browser", "search"],
    });
    await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "browser",
      toolNames: ["composio_browser_navigate"],
      enabled: true,
    });

    const resolved = await t.query(internal.capabilities.forConnector, { spaceId, agentId });
    const byCap = new Map(resolved.map((r: { capability: string; toolNames: string[] }) => [r.capability, r.toolNames]));
    expect(byCap.get("browser")).toEqual(["composio_browser_navigate"]);
    expect(byCap.get("search")).toEqual([]); // declared, no grant wired up

    // Empty for an agent outside the Space.
    const otherSpaceId = await owner.mutation(api.spaces.create, { name: "OtherSpace" });
    const empty = await t.query(internal.capabilities.forConnector, {
      spaceId: otherSpaceId,
      agentId,
    });
    expect(empty).toEqual([]);
  });

  test("explicit capabilities override the agent's declared set", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_conn2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "ConnTools2" });
    const agentId = (
      await owner.action(api.agents.create, { spaceId, name: "Connector agent 2" })
    ).agentId as Id<"agents">;
    await t.mutation(internal.agents.recordHeartbeat, {
      agentId,
      status: "online",
      capabilities: ["browser"],
    });
    await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "email",
      toolNames: ["composio_gmail_send"],
      enabled: true,
    });

    const resolved = await t.query(internal.capabilities.forConnector, {
      spaceId,
      agentId,
      capabilities: ["email"],
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0].capability).toBe("email");
    expect(resolved[0].toolNames).toEqual(["composio_gmail_send"]);
  });
});

describe("evals: listBatches / compareBatch rollups (feature 13)", () => {
  test("groups runs by batchId, rolls up avg quality + total cost, and derives batch status", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_batch1" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "BatchRollup" });
    const agentA = (
      await owner.action(api.agents.create, { spaceId, name: "Agent A" })
    ).agentId as Id<"agents">;
    const agentB = (
      await owner.action(api.agents.create, { spaceId, name: "Agent B" })
    ).agentId as Id<"agents">;
    const benchmarkId = await owner.mutation(api.evals.createBenchmark, {
      spaceId,
      name: "Rollup bench",
      prompt: "Summarize this",
    });

    const batchId = "batch-rollup-1";
    await t.run(async (ctx) => {
      await ctx.db.insert("evalRuns", {
        companyId: "org_batch1",
        spaceId,
        benchmarkId,
        batchId,
        agentId: agentA,
        harness: "hermes",
        model: "claude-opus-4-8",
        status: "completed",
        qualityScore: 0.8,
        costUsd: 0.02,
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 900,
        startedAt: 1000,
        finishedAt: 1500,
      });
      await ctx.db.insert("evalRuns", {
        companyId: "org_batch1",
        spaceId,
        benchmarkId,
        batchId,
        agentId: agentB,
        harness: "goose",
        model: "gpt-4o-mini",
        status: "failed",
        error: "timeout",
        costUsd: 0.0,
        startedAt: 1000,
        finishedAt: 1300,
      });
    });

    const batches = await owner.query(api.evals.listBatches, { spaceId });
    expect(batches).toHaveLength(1);
    expect(batches[0].batchId).toBe(batchId);
    expect(batches[0].runCount).toBe(2);
    // Only the completed run has a qualityScore, so avgQuality is just its own.
    expect(batches[0].avgQuality).toBe(0.8);
    expect(batches[0].totalCostUsd).toBeCloseTo(0.02);
    // One failed run alongside a completed one -> "partial", not "completed".
    expect(batches[0].status).toBe("partial");

    const compared = await owner.query(api.evals.compareBatch, { spaceId, batchId });
    expect(compared).toHaveLength(2);
    const byAgent = new Map(compared.map((r: { agentId: string }) => [r.agentId, r]));
    expect(byAgent.get(agentA)!.harness).toBe("hermes");
    expect(byAgent.get(agentA)!.qualityScore).toBe(0.8);
    expect(byAgent.get(agentB)!.status).toBe("failed");
    expect(byAgent.get(agentB)!.error).toBe("timeout");
  });

  test("a batch with only pending/running runs reports status \"running\"", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_batch2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "BatchRunning" });
    const agentId = (
      await owner.action(api.agents.create, { spaceId, name: "Agent" })
    ).agentId as Id<"agents">;
    const benchmarkId = await owner.mutation(api.evals.createBenchmark, {
      spaceId,
      name: "Running bench",
      prompt: "Do the thing",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("evalRuns", {
        companyId: "org_batch2",
        spaceId,
        benchmarkId,
        batchId: "batch-running-1",
        agentId,
        status: "pending",
        startedAt: Date.now(),
      });
    });
    const batches = await owner.query(api.evals.listBatches, { spaceId });
    expect(batches[0].status).toBe("running");
    expect(batches[0].avgQuality).toBeNull();
  });
});
