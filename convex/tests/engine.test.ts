import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

const TWO_STEPS = [
  { id: "s1", name: "Find contacts", instruction: "look up leads" },
  {
    id: "s2",
    name: "Send outreach",
    instruction: "email them",
    dependsOn: ["s1"],
  },
];

afterEach(() => {
  vi.useRealTimers();
});

describe("workflow engine", () => {
  test("auto-run drives a two-step workflow to completion", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_wf" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "WF" });
    const wfId = await owner.mutation(api.workflows.create, {
      spaceId,
      name: "Outreach",
      steps: TWO_STEPS,
    });

    const runId = (await owner.mutation(api.workflows.start, {
      spaceId,
      workflowId: wfId,
      autoComplete: true,
    })) as Id<"workflowRuns">;

    // Drain the scheduler chain (advanceRun → completeStep → advanceRun …).
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(run?.status).toBe("completed");
    expect(run?.stepsDone).toBe(2);
  });

  test("approval-gated workflow halts at awaiting_approval and dispatches nothing", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_wf2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "WF2" });
    const wfId = await owner.mutation(api.workflows.create, {
      spaceId,
      name: "Gated",
      steps: [{ id: "s1", name: "Do it", instruction: "act" }],
      requiresApproval: true,
    });

    const runId = (await owner.mutation(api.workflows.start, {
      spaceId,
      workflowId: wfId,
    })) as Id<"workflowRuns">;
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const { run, steps, approvals } = await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      const steps = await ctx.db
        .query("runSteps")
        .withIndex("by_run", (q) => q.eq("workflowRunId", runId))
        .collect();
      const approvals = await ctx.db
        .query("approvals")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId as Id<"spaces">))
        .collect();
      return { run, steps, approvals };
    });

    expect(run?.status).toBe("awaiting_approval");
    // No step ever left "pending" — nothing was dispatched to an agent.
    expect(steps.every((s) => s.status === "pending")).toBe(true);
    expect(approvals.length).toBe(1);
    expect(approvals[0].status).toBe("pending");
  });
});

describe("tenant isolation", () => {
  test("another company cannot read a Space it doesn't belong to", async () => {
    const t = convexTest(schema, modules);
    const a = t.withIdentity({ subject: "user_a", org_id: "org_a" });
    const b = t.withIdentity({ subject: "user_b", org_id: "org_b" });
    const spaceId = await a.mutation(api.spaces.create, { name: "A-Space" });

    // Company B is not a member — every scoped read must be refused.
    await expect(b.query(api.spaces.get, { spaceId })).rejects.toThrow();
    await expect(
      b.query(api.reliability.listDeadLetters, { spaceId }),
    ).rejects.toThrow();
    await expect(b.mutation(api.workflows.start, {
      spaceId,
      workflowId: "x" as Id<"workflows">,
    })).rejects.toThrow();
  });
});
