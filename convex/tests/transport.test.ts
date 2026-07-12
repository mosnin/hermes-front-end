import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

describe("combined real-time work transport (pullWork)", () => {
  test("drains A2A inbox and heartbeats in one call", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_tx" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "TX" });
    const from = await owner.action(api.agents.create, {
      spaceId,
      name: "Sender",
    });
    const to = await owner.action(api.agents.create, {
      spaceId,
      name: "Receiver",
    });
    const toId = to.agentId as Id<"agents">;

    await owner.mutation(api.a2a.send, {
      spaceId,
      fromAgentId: from.agentId as Id<"agents">,
      toAgentId: toId,
      content: "ping over the real-time transport",
    });

    // One combined pull returns the queued message AND marks the agent online.
    const work = await t.mutation(internal.connector.pullWork, {
      agentId: toId,
    });
    expect(work.messages.length).toBe(1);
    expect(work.messages[0].content).toContain("real-time transport");
    expect(work.steps.length).toBe(0);

    // The message was consumed — a second pull is empty (no double delivery).
    const again = await t.mutation(internal.connector.pullWork, {
      agentId: toId,
    });
    expect(again.messages.length).toBe(0);
  });
});
