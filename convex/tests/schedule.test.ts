import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { withinSchedule } from "../lib/schedule";

const modules = import.meta.glob("../**/*.*s");

describe("scheduled active window", () => {
  test("withinSchedule: weekday business hours, UTC", () => {
    const sched = {
      enabled: true,
      days: [1, 2, 3, 4, 5],
      startMin: 540, // 09:00
      endMin: 1020, // 17:00
      tzOffsetMinutes: 0,
    };
    // Wed 2026-07-15 12:00 UTC → inside
    expect(withinSchedule(sched, Date.UTC(2026, 6, 15, 12, 0))).toBe(true);
    // Wed 08:00 → before window
    expect(withinSchedule(sched, Date.UTC(2026, 6, 15, 8, 0))).toBe(false);
    // Wed 18:00 → after window
    expect(withinSchedule(sched, Date.UTC(2026, 6, 15, 18, 0))).toBe(false);
    // Sun 12:00 → not an active day
    expect(withinSchedule(sched, Date.UTC(2026, 6, 12, 12, 0))).toBe(false);
    // Disabled → always active
    expect(withinSchedule({ ...sched, enabled: false }, Date.UTC(2026, 6, 12, 3, 0))).toBe(true);
    // No schedule → always active
    expect(withinSchedule(undefined, Date.now())).toBe(true);
  });

  test("overnight (wrapping) window", () => {
    const sched = {
      enabled: true,
      days: [5], // Friday
      startMin: 1320, // 22:00
      endMin: 360, // 06:00 next day
      tzOffsetMinutes: 0,
    };
    // Fri 23:00 → inside (tail of Friday)
    expect(withinSchedule(sched, Date.UTC(2026, 6, 17, 23, 0))).toBe(true);
    // Sat 05:00 → inside (spill into Saturday from Friday window)
    expect(withinSchedule(sched, Date.UTC(2026, 6, 18, 5, 0))).toBe(true);
    // Sat 07:00 → outside
    expect(withinSchedule(sched, Date.UTC(2026, 6, 18, 7, 0))).toBe(false);
  });

  test("A2A send is refused outside the active window", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_sched" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "S" });
    const a = await owner.action(api.agents.create, { spaceId, name: "A" });
    const b = await owner.action(api.agents.create, { spaceId, name: "B" });

    // A window that is closed 'now' (0 minutes wide on a day we exclude).
    await owner.mutation(api.spaces.setSchedule, {
      spaceId,
      schedule: {
        enabled: true,
        days: [], // no active days → never within window
        startMin: 0,
        endMin: 1,
        tzOffsetMinutes: 0,
      },
    });

    await expect(
      owner.mutation(api.a2a.send, {
        spaceId,
        fromAgentId: a.agentId as Id<"agents">,
        toAgentId: b.agentId as Id<"agents">,
        content: "after hours",
      }),
    ).rejects.toThrow(/scheduled active hours/);

    // Clear the schedule → allowed again.
    await owner.mutation(api.spaces.setSchedule, { spaceId, schedule: null });
    await owner.mutation(api.a2a.send, {
      spaceId,
      fromAgentId: a.agentId as Id<"agents">,
      toAgentId: b.agentId as Id<"agents">,
      content: "back in hours",
    });
  });
});
