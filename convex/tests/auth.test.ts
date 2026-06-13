import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

// convex-test discovers Convex modules relative to the file that calls
// import.meta.glob. Tests live in convex/tests/, so we glob one level up to
// pick up all the function modules under convex/.
const modules = import.meta.glob("../**/*.*s");

describe("tenant isolation (resolveScope)", () => {
  test("creator can read their own Space", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_a" });

    const spaceId = await owner.mutation(api.spaces.create, {
      name: "Acme Ops",
    });

    const space = await owner.query(api.spaces.get, { spaceId });
    expect(space.name).toBe("Acme Ops");
    expect(space.role).toBe("owner");
  });

  test("a user in a different Company cannot read the Space", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_a" });
    const outsider = t.withIdentity({ subject: "user_other", org_id: "org_b" });

    const spaceId = await owner.mutation(api.spaces.create, {
      name: "Acme Ops",
    });

    // Different org_id => different companyId => Space is invisible.
    await expect(
      outsider.query(api.spaces.get, { spaceId }),
    ).rejects.toThrow(/Space not found/);
  });

  test("a same-Company non-member cannot read the Space", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_a" });
    // Same company (org_a) but not the creator and not a member.
    const peer = t.withIdentity({ subject: "user_peer", org_id: "org_a" });

    const spaceId = await owner.mutation(api.spaces.create, {
      name: "Acme Ops",
    });

    await expect(
      peer.query(api.spaces.get, { spaceId }),
    ).rejects.toThrow(/Forbidden/);
  });

  test("unauthenticated callers are rejected", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_a" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Acme" });

    await expect(t.query(api.spaces.get, { spaceId })).rejects.toThrow(
      /Unauthenticated/,
    );
  });
});
