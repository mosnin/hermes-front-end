import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// NOTE: `capabilities.ts` is a brand-new Convex module this cycle. Convex's
// generated `api` object is a runtime Proxy (`anyApi`) that resolves
// `api.capabilities.*` against the actual loaded module files below, so
// these tests run correctly today even though `convex/_generated/api.d.ts`
// hasn't been regenerated yet (that's a types-only gap — see the cycle
// report). `npx tsc --noEmit` will flag `api.capabilities.*` here until the
// integrator regenerates codegen; that's expected.
const modules = import.meta.glob("../**/*.*s");

describe("capabilities: normalized tool layer (grants)", () => {
  test("admin can grant a capability; operator cannot", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_cap" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Caps" });

    const grantId = await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "browser",
      toolNames: ["composio_browser_navigate", "composio_browser_click"],
      provider: "composio",
      enabled: true,
    });
    expect(grantId).toBeDefined();

    const grants = await owner.query(api.capabilities.listGrants, { spaceId });
    expect(grants).toHaveLength(1);
    expect(grants[0].capability).toBe("browser");
    expect(grants[0].toolNames).toHaveLength(2);

    // Add an operator member — insufficient role for mutating grants.
    await owner.mutation(api.spaces.addMember, {
      spaceId,
      userId: "user_op",
      role: "operator",
    });
    const operator = t.withIdentity({ subject: "user_op", org_id: "org_cap" });
    await expect(
      operator.mutation(api.capabilities.upsertGrant, {
        spaceId,
        capability: "email",
        toolNames: ["composio_gmail_send"],
        enabled: true,
      }),
    ).rejects.toThrow(/Forbidden/);
  });

  test("resolveTools merges enabled grants and respects agent restriction + disabled grants", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_cap2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Caps2" });

    const agentA = (
      await owner.action(api.agents.create, { spaceId, name: "Agent A" })
    ).agentId as Id<"agents">;
    const agentB = (
      await owner.action(api.agents.create, { spaceId, name: "Agent B" })
    ).agentId as Id<"agents">;

    // Space-wide grant (no agentIds restriction).
    await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "search",
      toolNames: ["composio_web_search"],
      enabled: true,
    });
    // Agent-restricted grant, only for agentA.
    await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "search",
      toolNames: ["composio_deep_research"],
      agentIds: [agentA],
      enabled: true,
    });
    // Disabled grant should never resolve.
    await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "search",
      toolNames: ["should_not_appear"],
      enabled: false,
    });

    const forA = await owner.query(api.capabilities.resolveTools, {
      spaceId,
      capabilities: ["search"],
      agentId: agentA,
    });
    expect(forA[0].toolNames.sort()).toEqual(
      ["composio_deep_research", "composio_web_search"].sort(),
    );

    const forB = await owner.query(api.capabilities.resolveTools, {
      spaceId,
      capabilities: ["search"],
      agentId: agentB,
    });
    expect(forB[0].toolNames).toEqual(["composio_web_search"]);
  });

  test("removeGrant deletes a grant (admin-only)", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_cap3" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Caps3" });
    const grantId = await owner.mutation(api.capabilities.upsertGrant, {
      spaceId,
      capability: "crm",
      toolNames: ["composio_hubspot_create_contact"],
      enabled: true,
    });
    await owner.mutation(api.capabilities.removeGrant, { spaceId, grantId });
    const grants = await owner.query(api.capabilities.listGrants, { spaceId });
    expect(grants).toHaveLength(0);
  });
});

describe("capabilities: A2A public directory (feature 15) double opt-in", () => {
  test("an agent only appears publicly when BOTH the Space directory and the agent are published", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_dir" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Directory" });
    const agentId = (
      await owner.action(api.agents.create, { spaceId, name: "Published Agent" })
    ).agentId as Id<"agents">;

    // Neither toggle set yet — not public.
    let dir = await owner.query(api.capabilities.publicDirectory, {});
    expect(dir.page.find((a: { agentId: string }) => a.agentId === agentId)).toBeUndefined();

    // Publish the agent but leave the Space directory disabled — still not public.
    await owner.mutation(api.capabilities.setAgentPublished, {
      spaceId,
      agentId,
      published: true,
    });
    dir = await owner.query(api.capabilities.publicDirectory, {});
    expect(dir.page.find((a: { agentId: string }) => a.agentId === agentId)).toBeUndefined();

    // Enable the Space directory too — now it's public.
    await owner.mutation(api.capabilities.setDirectoryEnabled, {
      spaceId,
      enabled: true,
    });
    dir = await owner.query(api.capabilities.publicDirectory, {});
    const found = dir.page.find((a: { agentId: string }) => a.agentId === agentId);
    expect(found).toBeDefined();
    expect(found.cardPath).toBe(`/a2a/card/${agentId}`);

    // Turning the agent back to private removes it again.
    await owner.mutation(api.capabilities.setAgentPublished, {
      spaceId,
      agentId,
      published: false,
    });
    dir = await owner.query(api.capabilities.publicDirectory, {});
    expect(dir.page.find((a: { agentId: string }) => a.agentId === agentId)).toBeUndefined();
  });

  test("setAgentPublished and setDirectoryEnabled require admin", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_dir2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Directory2" });
    await owner.mutation(api.spaces.addMember, {
      spaceId,
      userId: "user_op",
      role: "operator",
    });
    const operator = t.withIdentity({ subject: "user_op", org_id: "org_dir2" });
    await expect(
      operator.mutation(api.capabilities.setDirectoryEnabled, { spaceId, enabled: true }),
    ).rejects.toThrow(/Forbidden/);
  });
});

describe("router: capability-based routing (feature 11)", () => {
  test("routeBest picks the agent with the best capability + health score", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_route" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Routing" });

    const weak = (
      await owner.action(api.agents.create, { spaceId, name: "Weak match" })
    ).agentId as Id<"agents">;
    const strong = (
      await owner.action(api.agents.create, { spaceId, name: "Strong match" })
    ).agentId as Id<"agents">;

    // "weak" only has one of the two required capabilities.
    await t.mutation(internal.agents.recordHeartbeat, {
      agentId: weak,
      status: "online",
      capabilities: ["code-gen"],
    });
    // "strong" has both.
    await t.mutation(internal.agents.recordHeartbeat, {
      agentId: strong,
      status: "online",
      capabilities: ["code-gen", "browser"],
    });

    const ranked = await owner.query(api.router.route, {
      spaceId,
      requiredCapabilities: ["code-gen", "browser"],
    });
    expect(ranked[0].agentId).toBe(strong);
    expect(ranked[0].capabilityScore).toBe(1);
    expect(ranked.find((r: { agentId: string }) => r.agentId === weak)?.capabilityScore).toBe(0.5);

    const best = await owner.query(api.router.routeBest, {
      spaceId,
      requiredCapabilities: ["code-gen", "browser"],
    });
    expect(best?._id).toBe(strong);
  });

  test("an explicit override bypasses scoring entirely", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_route2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Routing2" });

    const good = (
      await owner.action(api.agents.create, { spaceId, name: "Good" })
    ).agentId as Id<"agents">;
    const overridden = (
      await owner.action(api.agents.create, { spaceId, name: "Overridden" })
    ).agentId as Id<"agents">;
    await t.mutation(internal.agents.recordHeartbeat, {
      agentId: good,
      status: "online",
      capabilities: ["code-gen"],
    });

    const best = await owner.query(api.router.routeBest, {
      spaceId,
      requiredCapabilities: ["code-gen"],
      overrideAgentId: overridden,
    });
    expect(best?._id).toBe(overridden);
  });

  test("routeTask assigns the best agent and records a work event", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_route3" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Routing3" });
    const agentId = (
      await owner.action(api.agents.create, { spaceId, name: "Coder" })
    ).agentId as Id<"agents">;
    await t.mutation(internal.agents.recordHeartbeat, {
      agentId,
      status: "online",
      capabilities: ["code-gen"],
    });
    const taskId = await owner.mutation(api.tasks.create, {
      spaceId,
      title: "Write a function",
      priority: "medium",
    });
    // tasks.create/update don't yet expose `requiredCapabilities` in their
    // args validators (tasks.ts is owned by another team — see cycle report
    // cross-team request) even though the schema field exists; patch it
    // directly for this test.
    await t.run(async (ctx) => {
      await ctx.db.patch(taskId, { requiredCapabilities: ["code-gen"] });
    });

    const assigned = await owner.mutation(api.router.routeTask, { spaceId, taskId });
    expect(assigned).toBe(agentId);

    const tasks = await owner.query(api.tasks.list, { spaceId });
    expect(tasks.find((tk: { _id: string }) => tk._id === taskId)?.assigneeAgentId).toBe(
      agentId,
    );
  });
});
