import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.*s");

describe("autonomy kill switch guards a2a.send", () => {
  test("a2a.send works normally, then is blocked once autonomy is paused", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_a" });

    const spaceId = await owner.mutation(api.spaces.create, { name: "Fleet" });

    // Two external A2A agents so we have a sender + recipient in the Space.
    const fromAgentId = await owner.mutation(api.agents.registerExternal, {
      spaceId,
      name: "Agent A",
      cardUrl: "https://example.com/a.json",
    });
    const toAgentId = await owner.mutation(api.agents.registerExternal, {
      spaceId,
      name: "Agent B",
      cardUrl: "https://example.com/b.json",
    });

    // Autonomy is active by default — a send should succeed.
    const msgId = await owner.mutation(api.a2a.send, {
      spaceId,
      fromAgentId,
      toAgentId,
      content: "hello",
    });
    expect(msgId).toBeDefined();

    // Engage the kill switch.
    await owner.mutation(api.spaces.setAutonomyPaused, {
      spaceId,
      paused: true,
    });

    // Now dispatch must be refused by the autonomy guard.
    await expect(
      owner.mutation(api.a2a.send, {
        spaceId,
        fromAgentId,
        toAgentId,
        content: "are you there?",
      }),
    ).rejects.toThrow(/GuardViolation|autonomy is paused/);
  });
});
