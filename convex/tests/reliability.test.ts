import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

describe("reliability primitives", () => {
  test("idempotency: a repeated key is only accepted once", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_rel" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Rel" });
    const agent = await owner.action(api.agents.create, {
      spaceId,
      name: "A",
    });
    const agentId = agent.agentId as Id<"agents">;

    const first = await t.mutation(internal.connector.markIfFirst, {
      agentId,
      key: "evt-123",
    });
    const second = await t.mutation(internal.connector.markIfFirst, {
      agentId,
      key: "evt-123",
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  test("atomic ingestMessage dedupes without double-writing the message", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_idem" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Idem" });
    const agent = await owner.action(api.agents.create, { spaceId, name: "A" });
    const agentId = agent.agentId as Id<"agents">;
    const companyId = await t.run(async (ctx) => {
      const s = await ctx.db.get(spaceId as Id<"spaces">);
      return s!.companyId;
    });

    const ingest = () =>
      t.mutation(internal.connector.ingestMessage, {
        agentId,
        companyId,
        spaceId,
        connectorKey: "thread-1",
        threadTitle: "T",
        role: "assistant",
        content: "hello world",
        idempotencyKey: "msg-1",
      });

    const first = await ingest();
    const second = await ingest();
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);

    // Exactly one message persisted despite two ingest calls.
    const msgs = await t.run(async (ctx) =>
      ctx.db
        .query("messages")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId as Id<"spaces">))
        .collect(),
    );
    expect(msgs.length).toBe(1);
  });

  test("dead-letters are listed and can be dismissed", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_rel2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Rel2" });

    // Seed a dead-letter directly (as the engine would on terminal failure).
    const dlId = await t.run(async (ctx) => {
      const space = await ctx.db.get(spaceId as Id<"spaces">);
      return await ctx.db.insert("deadLetters", {
        companyId: space!.companyId,
        spaceId: spaceId as Id<"spaces">,
        kind: "step",
        error: "step blew up",
        status: "open",
        createdAt: Date.now(),
      });
    });

    const open = await owner.query(api.reliability.listDeadLetters, {
      spaceId,
      status: "open",
    });
    expect(open.length).toBe(1);
    expect(await owner.query(api.reliability.openCount, { spaceId })).toBe("1");

    await owner.mutation(api.reliability.dismissDeadLetter, {
      spaceId,
      deadLetterId: dlId,
    });
    const stillOpen = await owner.query(api.reliability.listDeadLetters, {
      spaceId,
      status: "open",
    });
    expect(stillOpen.length).toBe(0);
  });
});
