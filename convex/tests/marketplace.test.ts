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

describe("marketplace.listTemplates — category filtering and search", () => {
  test("filtering by a public category does not leak unrelated private snapshots", async () => {
    const { t, owner, spaceId } = await setup();
    process.env.PLATFORM_ADMIN_IDS = "seed_admin_cat";
    const admin = t.withIdentity({ subject: "seed_admin_cat", org_id: "org_x" });
    await admin.mutation(api.marketplace.seed, {});
    delete process.env.PLATFORM_ADMIN_IDS;

    // Save a private snapshot — snapshotAgent always tags it category "custom".
    const { agentId } = await owner.action(api.agents.create, { spaceId, name: "Snap Source" });
    await owner.mutation(api.marketplace.snapshotAgent, {
      spaceId,
      agentId: agentId as Id<"agents">,
      name: "My private ops helper",
    });

    // The "sales" tab should only contain sales-category public templates —
    // never the private "custom"-category snapshot.
    const salesTab = await owner.query(api.marketplace.listTemplates, {
      spaceId,
      category: "sales",
    });
    expect(salesTab.length).toBeGreaterThan(0);
    expect(salesTab.every((t) => t.category === "sales")).toBe(true);
    expect(salesTab.find((t) => t.name === "My private ops helper")).toBeUndefined();

    // The "custom" ("Your Space") tab surfaces the private snapshot.
    const customTab = await owner.query(api.marketplace.listTemplates, {
      spaceId,
      category: "custom",
    });
    expect(customTab.find((t) => t.name === "My private ops helper")).toBeDefined();
  });

  test("search matches name, tagline, and capabilities case-insensitively", async () => {
    const { t, owner, spaceId } = await setup();
    process.env.PLATFORM_ADMIN_IDS = "seed_admin_search";
    const admin = t.withIdentity({ subject: "seed_admin_search", org_id: "org_x" });
    await admin.mutation(api.marketplace.seed, {});
    delete process.env.PLATFORM_ADMIN_IDS;

    const byName = await owner.query(api.marketplace.listTemplates, {
      spaceId,
      search: "SUPPORT triage",
    });
    expect(byName.some((t) => t.slug === "support-triage")).toBe(true);

    // "crm" only appears in the SDR template's `capabilities` array, not in
    // its name/tagline/description — proves the capability field is searched.
    const byCapability = await owner.query(api.marketplace.listTemplates, {
      spaceId,
      search: "crm",
    });
    expect(byCapability.some((t) => t.slug === "sdr-outbound")).toBe(true);

    const noMatch = await owner.query(api.marketplace.listTemplates, {
      spaceId,
      search: "definitely-not-a-real-template-xyz",
    });
    expect(noMatch.length).toBe(0);
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

  test("an explicit securityProfileId override wins over the template's named suggestion", async () => {
    const { t, owner, spaceId } = await setup();

    const namedProfileId = await owner.mutation(api.securityProfiles.create, {
      spaceId,
      name: "sales-default",
      toolAllowlist: ["email"],
    });
    const overrideProfileId = await owner.mutation(api.securityProfiles.create, {
      spaceId,
      name: "locked-down",
      toolAllowlist: [],
    });

    const templateId: Id<"agentTemplates"> = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("agentTemplates", {
        slug: "sec-profile-override",
        name: "Override template",
        visibility: "public",
        harness: "hermes",
        securityProfileName: "sales-default",
        installCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    const install1 = await owner.action(api.marketplace.install, {
      spaceId,
      templateId,
      securityProfileId: overrideProfileId,
    });
    const agent1 = await owner.query(api.agents.get, { spaceId, agentId: install1.agentId });
    expect(agent1?.securityProfileId).toBe(overrideProfileId);
    expect(agent1?.securityProfileId).not.toBe(namedProfileId);
  });

  test("an override id from a different Space is rejected", async () => {
    const { t, owner, spaceId } = await setup();

    const otherOwner = t.withIdentity({ subject: "user_other_owner", org_id: "org_other" });
    const otherSpaceId = await otherOwner.mutation(api.spaces.create, { name: "Other" });
    const foreignProfileId = await otherOwner.mutation(api.securityProfiles.create, {
      spaceId: otherSpaceId,
      name: "foreign",
    });

    const templateId: Id<"agentTemplates"> = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("agentTemplates", {
        slug: "sec-profile-foreign",
        name: "Foreign override template",
        visibility: "public",
        harness: "hermes",
        installCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      owner.action(api.marketplace.install, {
        spaceId,
        templateId,
        securityProfileId: foreignProfileId,
      }),
    ).rejects.toThrow(/not found/i);
  });
});
