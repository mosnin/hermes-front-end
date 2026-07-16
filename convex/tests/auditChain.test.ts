import { describe, expect, test } from "vitest";
import { buildChain, verifyChain, canonical } from "../lib/auditChain";

const EVENTS = [
  { at: "2026-07-12T00:00:00Z", action: "secret_set", summary: "Set secret X" },
  { at: "2026-07-12T00:01:00Z", action: "plan_changed", summary: "Plan → team" },
  { at: "2026-07-12T00:02:00Z", action: "token_rotated", summary: "Rotated A" },
];

describe("tamper-evident audit chain", () => {
  test("canonical stringify is key-order independent", () => {
    expect(canonical({ b: 1, a: { d: 2, c: [3, null] } })).toBe(
      canonical({ a: { c: [3, null], d: 2 }, b: 1 }),
    );
  });

  test("an untouched export verifies", async () => {
    const { chained, head } = await buildChain(EVENTS, "genesis:s1");
    expect(chained.length).toBe(3);
    expect(await verifyChain(chained, "genesis:s1", head)).toBe(true);
  });

  test("editing, removing, or reordering any entry breaks verification", async () => {
    const { chained, head } = await buildChain(EVENTS, "genesis:s1");

    // Edit an early entry (rewriting history).
    const edited = chained.map((c, i) =>
      i === 0 ? { ...c, entry: { ...c.entry, summary: "innocent" } } : c,
    );
    expect(await verifyChain(edited, "genesis:s1", head)).toBe(false);

    // Drop an entry.
    expect(
      await verifyChain([chained[0], chained[2]], "genesis:s1", head),
    ).toBe(false);

    // Reorder.
    expect(
      await verifyChain([chained[1], chained[0], chained[2]], "genesis:s1", head),
    ).toBe(false);

    // Wrong genesis (chain grafted from another Space).
    expect(await verifyChain(chained, "genesis:s2", head)).toBe(false);
  });
});
