import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

const ADMIN = "user_admin";
const OUTSIDER = "user_outsider";

describe("platform admin (SOC2)", () => {
  beforeEach(() => {
    process.env.PLATFORM_ADMIN_IDS = `${ADMIN}, admin@hermes.dev`;
  });
  afterEach(() => {
    delete process.env.PLATFORM_ADMIN_IDS;
  });

  test("fail-closed: an unauthenticated caller is not an admin", async () => {
    const t = convexTest(schema, modules);
    const anon = await t.query(api.admin.status, {});
    expect(anon.isAdmin).toBe(false);
  });

  test("only the allowlisted identity is an admin; others are refused", async () => {
    const t = convexTest(schema, modules);
    const admin = t.withIdentity({ subject: ADMIN, org_id: "org_admin" });
    const outsider = t.withIdentity({ subject: OUTSIDER, org_id: "org_x" });

    expect((await admin.query(api.admin.status, {})).isAdmin).toBe(true);
    expect((await outsider.query(api.admin.status, {})).isAdmin).toBe(false);

    // Privileged reads are refused for non-admins.
    await expect(outsider.query(api.admin.platformStats, {})).rejects.toThrow(
      /administrator access required/,
    );
    // …and allowed for admins.
    const stats = await admin.query(api.admin.platformStats, {});
    expect(stats.companies).toBeGreaterThanOrEqual(0);
  });

  test("with no allowlist configured, nobody is an admin (fail closed)", async () => {
    delete process.env.PLATFORM_ADMIN_IDS;
    const t = convexTest(schema, modules);
    const admin = t.withIdentity({ subject: ADMIN, org_id: "org_admin" });
    expect((await admin.query(api.admin.status, {})).isAdmin).toBe(false);
    await expect(admin.query(api.admin.platformStats, {})).rejects.toThrow(
      /not configured/,
    );
  });

  test("setting a platform flag is enforced and written to the immutable audit trail", async () => {
    const t = convexTest(schema, modules);
    const admin = t.withIdentity({ subject: ADMIN, org_id: "org_admin" });

    await admin.mutation(api.admin.setFlag, {
      key: "global_autonomy_paused",
      enabled: true,
    });
    const flags = await admin.query(api.admin.flags, {});
    expect(flags.globalAutonomyPaused).toBe(true);

    const trail = await admin.query(api.admin.auditTrail, {});
    expect(trail.some((e) => e.action === "flag_enabled")).toBe(true);
    expect(trail[0].adminId).toBe(ADMIN);
  });

  test("per-company break-glass pauses all of a company's spaces, audited", async () => {
    const t = convexTest(schema, modules);
    const admin = t.withIdentity({ subject: ADMIN, org_id: "org_admin" });
    const owner = t.withIdentity({ subject: "u", org_id: "org_pausable" });
    const s1 = await owner.mutation(api.spaces.create, { name: "One" });
    const s2 = await owner.mutation(api.spaces.create, { name: "Two" });
    const companyId = await t.run(async (ctx) => {
      const s = await ctx.db.get(s1 as Id<"spaces">);
      return s!.companyId;
    });

    const res = await admin.mutation(api.admin.setCompanyAutonomy, {
      companyId,
      paused: true,
    });
    expect(res.spaces).toBe(2);

    const paused = await t.run(async (ctx) => {
      const a = await ctx.db.get(s1 as Id<"spaces">);
      const b = await ctx.db.get(s2 as Id<"spaces">);
      return a?.autonomyPaused && b?.autonomyPaused;
    });
    expect(paused).toBe(true);

    const trail = await admin.query(api.admin.auditTrail, {});
    expect(trail.some((e) => e.action === "company_paused")).toBe(true);

    // A non-admin cannot use the lever.
    await expect(
      owner.mutation(api.admin.setCompanyAutonomy, { companyId, paused: false }),
    ).rejects.toThrow(/administrator access required/);
  });

  test("the global kill switch also blocks the AUTONOMOUS trigger path", async () => {
    const t = convexTest(schema, modules);
    const admin = t.withIdentity({ subject: ADMIN, org_id: "org_admin" });
    const owner = t.withIdentity({ subject: "u", org_id: "org_trig" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "Trig" });
    const wfId = await owner.mutation(api.workflows.create, {
      spaceId,
      name: "Auto",
      steps: [{ id: "s1", name: "Do", instruction: "act" }],
    });

    // Engage the global kill switch.
    await admin.mutation(api.admin.setFlag, {
      key: "global_autonomy_paused",
      enabled: true,
    });

    // A trigger-driven run must be declined (returns null), not dispatched.
    const runId = await t.mutation(internal.workflows.startFromTrigger, {
      workflowId: wfId,
      trigger: "webhook",
    });
    expect(runId).toBeNull();

    // Release the switch → the trigger path works again.
    await admin.mutation(api.admin.setFlag, {
      key: "global_autonomy_paused",
      enabled: false,
    });
    const runId2 = await t.mutation(internal.workflows.startFromTrigger, {
      workflowId: wfId,
      trigger: "webhook",
    });
    expect(runId2).not.toBeNull();
  });

  test("the global kill switch blocks tenant autonomy", async () => {
    const t = convexTest(schema, modules);
    const admin = t.withIdentity({ subject: ADMIN, org_id: "org_admin" });
    // A normal tenant in a different org.
    const owner = t.withIdentity({ subject: "u", org_id: "org_tenant" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "T" });
    const a = await owner.action(api.agents.create, { spaceId, name: "A" });
    const b = await owner.action(api.agents.create, { spaceId, name: "B" });

    // Works before the global pause.
    await owner.mutation(api.a2a.send, {
      spaceId,
      fromAgentId: a.agentId as Id<"agents">,
      toAgentId: b.agentId as Id<"agents">,
      content: "hi",
    });

    // Admin engages the global kill switch.
    await admin.mutation(api.admin.setFlag, {
      key: "global_autonomy_paused",
      enabled: true,
    });

    // Now the tenant's autonomous send is refused platform-wide.
    await expect(
      owner.mutation(api.a2a.send, {
        spaceId,
        fromAgentId: a.agentId as Id<"agents">,
        toAgentId: b.agentId as Id<"agents">,
        content: "again",
      }),
    ).rejects.toThrow(/platform autonomy is paused/);
  });
});
