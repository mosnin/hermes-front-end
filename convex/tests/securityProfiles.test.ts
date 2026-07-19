import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { isToolAllowed, assertToolAllowed } from "../securityProfiles";

const modules = import.meta.glob("../**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "user_owner", org_id: "org_sec" });
  const spaceId = await owner.mutation(api.spaces.create, { name: "Sec" });
  return { t, owner, spaceId: spaceId as Id<"spaces"> };
}

describe("securityProfiles CRUD + RBAC", () => {
  test("operator can create, viewer cannot", async () => {
    const { t, owner, spaceId } = await setup();
    const profileId = await owner.mutation(api.securityProfiles.create, {
      spaceId,
      name: "default",
      toolAllowlist: ["email"],
    });
    expect(profileId).toBeDefined();

    const viewerId = "user_sec_viewer";
    await owner.mutation(api.spaces.addMember, { spaceId, userId: viewerId, role: "viewer" });
    const viewer = t.withIdentity({ subject: viewerId, org_id: "org_sec" });
    await expect(
      viewer.mutation(api.securityProfiles.create, { spaceId, name: "x" }),
    ).rejects.toThrow(/[Ff]orbidden/);
  });

  test("duplicate names in the same Space are rejected", async () => {
    const { owner, spaceId } = await setup();
    await owner.mutation(api.securityProfiles.create, { spaceId, name: "dup" });
    await expect(
      owner.mutation(api.securityProfiles.create, { spaceId, name: "dup" }),
    ).rejects.toThrow(/already exists/);
  });

  test("only one profile can be default at a time", async () => {
    const { owner, spaceId } = await setup();
    const a = await owner.mutation(api.securityProfiles.create, {
      spaceId,
      name: "a",
      isDefault: true,
    });
    const b = await owner.mutation(api.securityProfiles.create, {
      spaceId,
      name: "b",
      isDefault: true,
    });
    const list = await owner.query(api.securityProfiles.list, { spaceId });
    const aRow = list.find((p) => p._id === a);
    const bRow = list.find((p) => p._id === b);
    expect(aRow?.isDefault).toBe(false);
    expect(bRow?.isDefault).toBe(true);
  });

  test("cannot delete a profile that agents are attached to", async () => {
    const { owner, spaceId } = await setup();
    const profileId = await owner.mutation(api.securityProfiles.create, { spaceId, name: "p" });
    const { agentId } = await owner.action(api.agents.create, { spaceId, name: "A" });
    await owner.mutation(api.securityProfiles.assign, {
      spaceId,
      agentId: agentId as Id<"agents">,
      profileId,
    });
    await expect(
      owner.mutation(api.securityProfiles.remove, { spaceId, profileId }),
    ).rejects.toThrow(/agent/);

    // Clear it, then delete succeeds.
    await owner.mutation(api.securityProfiles.assign, {
      spaceId,
      agentId: agentId as Id<"agents">,
      profileId: null,
    });
    await owner.mutation(api.securityProfiles.remove, { spaceId, profileId });
    const list = await owner.query(api.securityProfiles.list, { spaceId });
    expect(list.find((p) => p._id === profileId)).toBeUndefined();
  });

  test("validation rejects a non-positive fsQuotaMb", async () => {
    const { owner, spaceId } = await setup();
    await expect(
      owner.mutation(api.securityProfiles.create, { spaceId, name: "bad", fsQuotaMb: 0 }),
    ).rejects.toThrow(/fsQuotaMb/);
  });
});

describe("checkAgentTool query — cross-module tool allowlist enforcement", () => {
  test("no profile attached => unrestricted", async () => {
    const { owner, spaceId } = await setup();
    const { agentId } = await owner.action(api.agents.create, { spaceId, name: "A" });
    const res = await owner.query(api.securityProfiles.checkAgentTool, {
      spaceId,
      agentId: agentId as Id<"agents">,
      toolName: "anything",
    });
    expect(res.allowed).toBe(true);
  });

  test("profile with allowlist blocks tools outside it", async () => {
    const { owner, spaceId } = await setup();
    const profileId = await owner.mutation(api.securityProfiles.create, {
      spaceId,
      name: "restricted",
      toolAllowlist: ["email", "crm"],
    });
    const { agentId } = await owner.action(api.agents.create, { spaceId, name: "A" });
    await owner.mutation(api.securityProfiles.assign, {
      spaceId,
      agentId: agentId as Id<"agents">,
      profileId,
    });

    const allowed = await owner.query(api.securityProfiles.checkAgentTool, {
      spaceId,
      agentId: agentId as Id<"agents">,
      toolName: "email",
    });
    expect(allowed.allowed).toBe(true);

    const blocked = await owner.query(api.securityProfiles.checkAgentTool, {
      spaceId,
      agentId: agentId as Id<"agents">,
      toolName: "shell",
    });
    expect(blocked.allowed).toBe(false);
  });
});

describe("isToolAllowed / assertToolAllowed — pure helpers other modules import", () => {
  test("unset or empty allowlist means unrestricted", () => {
    expect(isToolAllowed(null, "shell")).toBe(true);
    expect(isToolAllowed({ toolAllowlist: undefined }, "shell")).toBe(true);
    expect(isToolAllowed({ toolAllowlist: [] }, "shell")).toBe(true);
  });

  test("a set allowlist restricts to exactly those tools", () => {
    expect(isToolAllowed({ toolAllowlist: ["email"] }, "email")).toBe(true);
    expect(isToolAllowed({ toolAllowlist: ["email"] }, "shell")).toBe(false);
  });

  test("assertToolAllowed throws for a disallowed tool", () => {
    expect(() => assertToolAllowed({ toolAllowlist: ["email"] }, "shell")).toThrow(
      /not permitted/,
    );
    expect(() => assertToolAllowed({ toolAllowlist: ["email"] }, "email")).not.toThrow();
  });
});
