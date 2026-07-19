import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "user_owner", org_id: "org_mkt" });
  const spaceId = await owner.mutation(api.spaces.create, { name: "Marketplace" });
  await t.run(async (ctx) => {
    await ctx.db.patch(spaceId, { plan: "team" });
  });
  return { t, owner, spaceId: spaceId as Id<"spaces"> };
}

describe("marketplace.seed — curated templates (platform admin only)", () => {
  const ADMIN = "user_seed_admin";

  beforeEach(() => {
    process.env.PLATFORM_ADMIN_IDS = ADMIN;
  });
  afterEach(() => {
    delete process.env.PLATFORM_ADMIN_IDS;
  });

  test("a non-admin cannot seed", async () => {
    const { t, owner } = await setup();
    void owner;
    const rando = t.withIdentity({ subject: "user_rando", org_id: "org_mkt" });
    await expect(rando.mutation(api.marketplace.seed, {})).rejects.toThrow(
      /administrator/,
    );
  });

  test("platform admin seeds 5 curated public templates, idempotently", async () => {
    const { t } = await setup();
    const admin = t.withIdentity({ subject: ADMIN, org_id: "org_seed" });

    const first = await admin.mutation(api.marketplace.seed, {});
    expect(first.inserted).toBe(first.total);
    expect(first.total).toBeGreaterThanOrEqual(4);

    // Re-seeding doesn't duplicate (slug-based idempotency).
    const second = await admin.mutation(api.marketplace.seed, {});
    expect(second.inserted).toBe(0);

    const all = await t.run(async (ctx) => ctx.db.query("agentTemplates").collect());
    expect(all.length).toBe(first.total);
    for (const tpl of all) {
      expect(tpl.visibility).toBe("public");
    }
  });
});

describe("marketplace.listTemplates / getTemplate — visibility", () => {
  test("curated public templates are visible to every Space", async () => {
    const { t, owner, spaceId } = await setup();
    process.env.PLATFORM_ADMIN_IDS = "seed_admin";
    const admin = t.withIdentity({ subject: "seed_admin", org_id: "org_x" });
    await admin.mutation(api.marketplace.seed, {});
    delete process.env.PLATFORM_ADMIN_IDS;

    const list = await owner.query(api.marketplace.listTemplates, { spaceId });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((tpl) => tpl.visibility === "public")).toBe(true);
  });

  test("a Space-private snapshot is only visible to its own Space", async () => {
    const { t, owner, spaceId } = await setup();
    const { agentId } = await owner.action(api.agents.create, {
      spaceId,
      name: "Source Agent",
    });

    const templateId = await owner.mutation(api.marketplace.snapshotAgent, {
      spaceId,
      agentId: agentId as Id<"agents">,
      name: "My private template",
    });

    const mine = await owner.query(api.marketplace.getTemplate, {
      spaceId,
      templateId,
    });
    expect(mine?.name).toBe("My private template");

    // A different Space can't see it.
    const other = t.withIdentity({ subject: "user_other", org_id: "org_other" });
    const otherSpaceId = await other.mutation(api.spaces.create, { name: "Other" });
    const denied = await other.query(api.marketplace.getTemplate, {
      spaceId: otherSpaceId,
      templateId,
    });
    expect(denied).toBeNull();

    // It also doesn't show up in the other Space's browse list.
    const otherList = await other.query(api.marketplace.listTemplates, {
      spaceId: otherSpaceId,
    });
    expect(otherList.find((tpl) => tpl._id === templateId)).toBeUndefined();
  });
});

describe("marketplace.install — self-connect", () => {
  test("clones bundled skills and creates an agent wired to the template config", async () => {
    const { t, owner, spaceId } = await setup();
    process.env.PLATFORM_ADMIN_IDS = "seed_admin2";
    const admin = t.withIdentity({ subject: "seed_admin2", org_id: "org_x" });
    await admin.mutation(api.marketplace.seed, {});
    delete process.env.PLATFORM_ADMIN_IDS;

    const templates = await owner.query(api.marketplace.listTemplates, { spaceId });
    const sdr = templates.find((tpl) => tpl.slug === "sdr-outbound");
    expect(sdr).toBeDefined();
    if (!sdr) return;

    const res = await owner.action(api.marketplace.install, {
      spaceId,
      templateId: sdr._id,
    });

    expect(res.hosted).toBe(false);
    expect(res.token).toBeDefined();
    expect(res.skillsCloned).toBeGreaterThan(0);

    const agent = await owner.query(api.agents.get, { spaceId, agentId: res.agentId });
    expect(agent?.systemPrompt).toBe(sdr.systemPrompt);
    expect(agent?.model).toBe(sdr.suggestedModel);
    expect(agent?.templateId).toBe(sdr._id);

    const skills = await owner.query(api.skills.list, { spaceId });
    expect(skills.length).toBe(res.skillsCloned);

    // installCount incremented on the template.
    const refreshed = await owner.query(api.marketplace.getTemplate, {
      spaceId,
      templateId: sdr._id,
    });
    expect(refreshed?.installCount).toBe(1);
  });

  test("installing twice doesn't clobber same-named skills", async () => {
    const { t, owner, spaceId } = await setup();
    process.env.PLATFORM_ADMIN_IDS = "seed_admin3";
    const admin = t.withIdentity({ subject: "seed_admin3", org_id: "org_x" });
    await admin.mutation(api.marketplace.seed, {});
    delete process.env.PLATFORM_ADMIN_IDS;

    const templates = await owner.query(api.marketplace.listTemplates, { spaceId });
    const support = templates.find((tpl) => tpl.slug === "support-triage");
    expect(support).toBeDefined();
    if (!support) return;

    const first = await owner.action(api.marketplace.install, { spaceId, templateId: support._id });
    const second = await owner.action(api.marketplace.install, {
      spaceId,
      templateId: support._id,
      name: "Second install",
    });

    expect(first.skillsCloned).toBeGreaterThan(0);
    expect(second.skillsCloned).toBe(0); // already present, not duplicated

    const skills = await owner.query(api.skills.list, { spaceId });
    expect(skills.length).toBe(first.skillsCloned);
  });

  test("a viewer cannot install", async () => {
    const { t, owner, spaceId } = await setup();
    process.env.PLATFORM_ADMIN_IDS = "seed_admin4";
    const admin = t.withIdentity({ subject: "seed_admin4", org_id: "org_x" });
    await admin.mutation(api.marketplace.seed, {});
    delete process.env.PLATFORM_ADMIN_IDS;

    const templates = await owner.query(api.marketplace.listTemplates, { spaceId });
    const tpl = templates[0];

    const viewerId = "user_mkt_viewer";
    await owner.mutation(api.spaces.addMember, { spaceId, userId: viewerId, role: "viewer" });
    const viewer = t.withIdentity({ subject: viewerId, org_id: "org_mkt" });

    await expect(
      viewer.action(api.marketplace.install, { spaceId, templateId: tpl._id }),
    ).rejects.toThrow(/[Ff]orbidden/);
  });
});

describe("marketplace.install — hosted deploy handoff", () => {
  test("deployHosted routes through fleet.deploy and attaches template metadata", async () => {
    const { t, owner, spaceId } = await setup();
    process.env.PLATFORM_ADMIN_IDS = "seed_admin5";
    const admin = t.withIdentity({ subject: "seed_admin5", org_id: "org_x" });
    await admin.mutation(api.marketplace.seed, {});
    delete process.env.PLATFORM_ADMIN_IDS;

    const templates = await owner.query(api.marketplace.listTemplates, { spaceId });
    const reviewer = templates.find((tpl) => tpl.slug === "code-reviewer");
    expect(reviewer).toBeDefined();
    if (!reviewer) return;

    const res = await owner.action(api.marketplace.install, {
      spaceId,
      templateId: reviewer._id,
      deployHosted: true,
    });

    expect(res.hosted).toBe(true);
    const agent = await owner.query(api.agents.get, { spaceId, agentId: res.agentId });
    // Cloudflare unconfigured in tests => fleet.deploy leaves it "provisioning",
    // but the fleet-provisioned agent still gets marketplace metadata attached.
    expect(agent?.vmProvider).toBe("cloudflare");
    expect(agent?.templateId).toBe(reviewer._id);
    expect(agent?.harness).toBe(reviewer.harness);
  });
});

describe("securityProfiles integration with template install", () => {
  test("install resolves + attaches the template's named security profile when it exists in the Space", async () => {
    const { t, owner, spaceId } = await setup();

    const profileId = await owner.mutation(api.securityProfiles.create, {
      spaceId,
      name: "sales-default",
      toolAllowlist: ["email", "crm"],
    });

    // Mirror a curated template's shape: a public template whose
    // securityProfileName should resolve to this Space's profile by name.
    const templateId: Id<"agentTemplates"> = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("agentTemplates", {
        slug: "sec-profile-test",
        name: "Security-linked template",
        visibility: "public",
        harness: "hermes",
        securityProfileName: "sales-default",
        installCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    const install1 = await owner.action(api.marketplace.install, { spaceId, templateId });
    const agent1 = await owner.query(api.agents.get, { spaceId, agentId: install1.agentId });
    expect(agent1?.securityProfileId).toBe(profileId);
  });

  test("install proceeds with no profile attached when the named profile doesn't exist in the Space", async () => {
    const { t, owner, spaceId } = await setup();

    const templateId: Id<"agentTemplates"> = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("agentTemplates", {
        slug: "sec-profile-missing",
        name: "Missing-profile template",
        visibility: "public",
        harness: "hermes",
        securityProfileName: "does-not-exist",
        installCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    const install1 = await owner.action(api.marketplace.install, { spaceId, templateId });
    const agent1 = await owner.query(api.agents.get, { spaceId, agentId: install1.agentId });
    expect(agent1?.securityProfileId).toBeUndefined();
  });
});
