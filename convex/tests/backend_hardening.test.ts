import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema, { DEFAULT_GUARD_CONFIG } from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

async function boot(org: string) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "u", org_id: org });
  const spaceId = await owner.mutation(api.spaces.create, { name: org });
  const a = await owner.action(api.agents.create, { spaceId, name: "A" });
  const companyId = await t.run(async (ctx) => {
    const s = await ctx.db.get(spaceId as Id<"spaces">);
    return s!.companyId;
  });
  return { t, owner, spaceId, companyId, agentId: a.agentId as Id<"agents"> };
}

describe("real token-cost metering", () => {
  test("reported tokens are estimated to dollars and stored with the row", async () => {
    const { t, owner, spaceId, companyId, agentId } = await boot("org_usage");
    // 1M in + 1M out at the default 3/15 rates = $18.
    const res = await t.mutation(internal.connector.reportUsage, {
      agentId,
      companyId,
      spaceId,
      model: "claude-x",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(res.costUsd).toBeCloseTo(18, 5);

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("usage")
        .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId as Id<"spaces">))
        .collect(),
    );
    const tokenRow = rows.find((r) => r.kind === "tokens");
    expect(tokenRow?.inputTokens).toBe(1_000_000);
    expect(tokenRow?.model).toBe("claude-x");

    // An exact costUsd overrides the estimate.
    const exact = await t.mutation(internal.connector.reportUsage, {
      agentId,
      companyId,
      spaceId,
      inputTokens: 500,
      outputTokens: 500,
      costUsd: 0.0123,
    });
    expect(exact.costUsd).toBe(0.0123);
    // Sanity: owner can read the space (usage summary path stays healthy).
    expect(await owner.query(api.spaces.get, { spaceId })).toBeTruthy();
  });

  test("real reported spend trips the monthly budget kill switch", async () => {
    const { t, owner, spaceId, companyId, agentId } = await boot("org_usage2");
    await owner.mutation(api.spaces.setGuardConfig, {
      spaceId,
      guardConfig: { ...DEFAULT_GUARD_CONFIG, monthlyBudgetUsd: 10 },
    });
    await t.mutation(internal.connector.reportUsage, {
      agentId,
      companyId,
      spaceId,
      inputTokens: 0,
      outputTokens: 1_000_000, // $15 at default rates > $10 budget
    });
    const space = await owner.query(api.spaces.get, { spaceId });
    expect(space?.autonomyPaused).toBe(true);
  });
});

describe("step output chaining", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a claimed step carries the outputs of its dependencies", async () => {
    vi.useFakeTimers();
    const { t, owner, spaceId, agentId } = await boot("org_chain");
    // Bring the agent online so workflow.start dispatches for real (no auto).
    await t.mutation(internal.agents.recordHeartbeat, {
      agentId,
      status: "online",
    });

    const wfId = await owner.mutation(api.workflows.create, {
      spaceId,
      name: "Outreach chain",
      steps: [
        { id: "find", name: "Find contacts", instruction: "look up leads" },
        {
          id: "email",
          name: "Send outreach",
          instruction: "email the contacts found",
          dependsOn: ["find"],
        },
      ],
    });
    const runId = (await owner.mutation(api.workflows.start, {
      spaceId,
      workflowId: wfId,
      autoComplete: false,
    })) as Id<"workflowRuns">;
    // advanceRun is scheduled; run it now.
    await t.mutation(internal.engine.advanceRun, { runId });

    // The agent claims step 1 — no dependencies, empty context.
    const first = await t.mutation(internal.engine.claimSteps, { agentId });
    expect(first.length).toBe(1);
    expect(first[0].stepId).toBe("find");
    expect(first[0].context).toEqual([]);

    // Agent reports step 1's result (the found contacts).
    await t.mutation(internal.engine.completeStep, {
      runId,
      stepId: "find",
      ok: true,
      output: "alice@acme.com, bob@globex.com",
    });
    await t.mutation(internal.engine.advanceRun, { runId });

    // Step 2's claim carries step 1's output.
    const second = await t.mutation(internal.engine.claimSteps, { agentId });
    expect(second.length).toBe(1);
    expect(second[0].stepId).toBe("email");
    expect(second[0].context.length).toBe(1);
    expect(second[0].context[0].step).toBe("Find contacts");
    expect(second[0].context[0].output).toContain("alice@acme.com");

    // Finish the run and drain scheduled work (step timeouts etc.) so nothing
    // fires after teardown.
    await t.mutation(internal.engine.completeStep, {
      runId,
      stepId: "email",
      ok: true,
      output: "sent",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(run?.status).toBe("completed");
  });
});

describe("retention sweep", () => {
  test("aged idempotency keys, errors, and stream chunks are deleted; fresh ones kept", async () => {
    const { t, spaceId, companyId, agentId } = await boot("org_retain");
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    await t.run(async (ctx) => {
      const sid = spaceId as Id<"spaces">;
      // Aged past every policy…
      await ctx.db.insert("idempotencyKeys", {
        agentId,
        key: "old",
        createdAt: now - 8 * DAY,
      });
      await ctx.db.insert("errors", {
        companyId,
        spaceId: sid,
        traceId: "t_old",
        source: "a2a",
        kind: "exception",
        message: "ancient",
        createdAt: now - 31 * DAY,
      });
      // …and fresh rows that must survive.
      await ctx.db.insert("idempotencyKeys", {
        agentId,
        key: "fresh",
        createdAt: now,
      });
      await ctx.db.insert("errors", {
        companyId,
        spaceId: sid,
        traceId: "t_new",
        source: "a2a",
        kind: "exception",
        message: "recent",
        createdAt: now,
      });
    });

    const deleted = await t.mutation(internal.maintenance.sweepRetention, {});
    expect(deleted.idempotencyKeys).toBe(1);
    expect(deleted.errors).toBe(1);

    const left = await t.run(async (ctx) => ({
      keys: await ctx.db.query("idempotencyKeys").collect(),
      errs: await ctx.db.query("errors").collect(),
    }));
    expect(left.keys.map((k) => k.key)).toEqual(["fresh"]);
    expect(left.errs.map((e) => e.traceId)).toEqual(["t_new"]);
  });
});
