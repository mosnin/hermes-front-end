import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

afterEach(() => {
  vi.useRealTimers();
});

describe("per-tenant metrics", () => {
  test("summary reflects runs, A2A delivery, and SLO verdicts", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_metrics" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "M" });

    // One completed workflow run.
    const wfId = await owner.mutation(api.workflows.create, {
      spaceId,
      name: "Job",
      steps: [{ id: "s1", name: "Do", instruction: "act" }],
    });
    await owner.mutation(api.workflows.start, {
      spaceId,
      workflowId: wfId,
      autoComplete: true,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // One acked A2A exchange.
    const a = await owner.action(api.agents.create, { spaceId, name: "A" });
    const b = await owner.action(api.agents.create, { spaceId, name: "B" });
    await owner.mutation(api.a2a.send, {
      spaceId,
      fromAgentId: a.agentId as Id<"agents">,
      toAgentId: b.agentId as Id<"agents">,
      content: "metric me",
    });
    const pulled = await t.mutation(internal.connector.pullWork, {
      agentId: b.agentId as Id<"agents">,
    });
    await t.mutation(internal.a2a.ackMessages, {
      agentId: b.agentId as Id<"agents">,
      ids: [pulled.messages[0].id],
    });

    const m = await owner.query(api.metrics.summary, { spaceId });
    expect(m.runs.started).toBe(1);
    expect(m.runs.completed).toBe(1);
    expect(m.runs.successRate).toBe(1);
    expect(m.runs.durationP50Ms).not.toBeNull();
    expect(m.a2a.sent).toBe(1);
    expect(m.a2a.acked).toBe(1);
    expect(m.a2a.expired).toBe(0);
    expect(m.deadLetters.open).toBe(0);
    expect(m.slo.runSuccess.ok).toBe(true);
    expect(m.slo.messageLoss.ok).toBe(true);
    expect(m.healthy).toBe(true);
  });
});
