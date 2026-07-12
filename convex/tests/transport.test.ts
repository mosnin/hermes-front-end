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

  test("at-least-once: unacked messages are redelivered; acked ones are not", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_alo" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "ALO" });
    const from = await owner.action(api.agents.create, { spaceId, name: "S" });
    const to = await owner.action(api.agents.create, { spaceId, name: "R" });
    const toId = to.agentId as Id<"agents">;

    await owner.mutation(api.a2a.send, {
      spaceId,
      fromAgentId: from.agentId as Id<"agents">,
      toAgentId: toId,
      content: "must survive a dropped connection",
    });

    // Claimed by the transport but never acked (simulated crash)…
    const first = await t.mutation(internal.connector.pullWork, { agentId: toId });
    expect(first.messages.length).toBe(1);
    const msgId = first.messages[0].id;

    // …age the delivery past the redelivery window, then sweep.
    await t.run(async (ctx) => {
      await ctx.db.patch(msgId, { deliveredAt: Date.now() - 10 * 60 * 1000 });
    });
    const sweep = await t.mutation(internal.a2a.redeliverUnacked, {});
    expect(sweep.requeued).toBe(1);

    // The message is pullable again — nothing was lost.
    const second = await t.mutation(internal.connector.pullWork, { agentId: toId });
    expect(second.messages.length).toBe(1);
    expect(second.messages[0].content).toContain("survive");

    // This time the recipient acks; the sweep no longer touches it.
    await t.mutation(internal.a2a.ackMessages, { agentId: toId, ids: [msgId] });
    await t.run(async (ctx) => {
      const m = await ctx.db.get(msgId);
      expect(m?.status).toBe("acked");
    });
    const sweep2 = await t.mutation(internal.a2a.redeliverUnacked, {});
    expect(sweep2.requeued).toBe(0);
  });

  test("only the addressee can ack a message", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_alo2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "ALO2" });
    const from = await owner.action(api.agents.create, { spaceId, name: "S" });
    const to = await owner.action(api.agents.create, { spaceId, name: "R" });
    const toId = to.agentId as Id<"agents">;

    await owner.mutation(api.a2a.send, {
      spaceId,
      fromAgentId: from.agentId as Id<"agents">,
      toAgentId: toId,
      content: "hands off",
    });
    const pulled = await t.mutation(internal.connector.pullWork, { agentId: toId });
    const msgId = pulled.messages[0].id;

    // The SENDER tries to ack the recipient's message — refused (0 acked).
    const res = await t.mutation(internal.a2a.ackMessages, {
      agentId: from.agentId as Id<"agents">,
      ids: [msgId],
    });
    expect(res.acked).toBe(0);
  });
});
