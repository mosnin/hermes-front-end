import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema, { DEFAULT_GUARD_CONFIG } from "../schema";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "user_owner", org_id: "org_meter" });
  const spaceId = await owner.mutation(api.spaces.create, { name: "Meter" });
  // Internal Hermes agents route through the broker (no external delivery is
  // scheduled), keeping the test transaction self-contained.
  const from = await owner.action(api.agents.create, {
    spaceId,
    name: "Sender",
  });
  const to = await owner.action(api.agents.create, {
    spaceId,
    name: "Receiver",
  });
  return {
    t,
    owner,
    spaceId,
    fromAgentId: from.agentId as Id<"agents">,
    toAgentId: to.agentId as Id<"agents">,
  };
}

describe("counter-backed guards (O(1) metering)", () => {
  test("per-minute rate limit blocks the (N+1)th send", async () => {
    const { owner, spaceId, fromAgentId, toAgentId } = await setup();
    await owner.mutation(api.spaces.setGuardConfig, {
      spaceId,
      guardConfig: { ...DEFAULT_GUARD_CONFIG, maxMessagesPerMinute: 3 },
    });

    // 3 sends allowed; content varies so loop-detection doesn't fire first.
    for (let i = 0; i < 3; i++) {
      await owner.mutation(api.a2a.send, {
        spaceId,
        fromAgentId,
        toAgentId,
        content: `hello ${i}`,
      });
    }
    // 4th send trips the rate limit (counter read == 3 >= 3).
    await expect(
      owner.mutation(api.a2a.send, {
        spaceId,
        fromAgentId,
        toAgentId,
        content: "one too many",
      }),
    ).rejects.toThrow(/rate limit/);
  });

  test("loop detection blocks identical repeats", async () => {
    const { owner, spaceId, fromAgentId, toAgentId } = await setup();
    await owner.mutation(api.spaces.setGuardConfig, {
      spaceId,
      guardConfig: {
        ...DEFAULT_GUARD_CONFIG,
        maxLoopRepeats: 2,
        maxMessagesPerMinute: 1000,
      },
    });
    await owner.mutation(api.a2a.send, {
      spaceId,
      fromAgentId,
      toAgentId,
      content: "PING",
    });
    await owner.mutation(api.a2a.send, {
      spaceId,
      fromAgentId,
      toAgentId,
      content: "ping", // normalized-equal to PING
    });
    await expect(
      owner.mutation(api.a2a.send, {
        spaceId,
        fromAgentId,
        toAgentId,
        content: "  Ping  ",
      }),
    ).rejects.toThrow(/loop detected/);
  });

  test("monthly budget auto-pauses autonomy via the running counter", async () => {
    const { owner, spaceId, fromAgentId, toAgentId } = await setup();
    // A2A message costs $0.0005 each. Budget $0.001 => pauses on the 2nd send.
    await owner.mutation(api.spaces.setGuardConfig, {
      spaceId,
      guardConfig: {
        ...DEFAULT_GUARD_CONFIG,
        monthlyBudgetUsd: 0.001,
        maxMessagesPerMinute: 1000,
      },
    });

    await owner.mutation(api.a2a.send, {
      spaceId,
      fromAgentId,
      toAgentId,
      content: "spend 1",
    });
    await owner.mutation(api.a2a.send, {
      spaceId,
      fromAgentId,
      toAgentId,
      content: "spend 2",
    });

    // The 2nd send's recordUsage pushed month-to-date to $0.001 >= budget and
    // auto-paused. The next send is refused by the kill switch.
    const space = await owner.query(api.spaces.get, { spaceId });
    expect(space?.autonomyPaused).toBe(true);
    await expect(
      owner.mutation(api.a2a.send, {
        spaceId,
        fromAgentId,
        toAgentId,
        content: "spend 3",
      }),
    ).rejects.toThrow(/autonomy is paused|GuardViolation/);
  });
});
