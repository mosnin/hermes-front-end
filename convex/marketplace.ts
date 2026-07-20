import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";
import { requirePlatformAdmin, auditAdmin } from "./lib/adminAuth";

/**
 * Template marketplace (feature 16): curated agent templates (harness +
 * skills + workflow bundle + suggested config) browsable per Space, plus
 * space-private snapshots (feature 9 — sourceAgentId set, visibility
 * "space"). Install clones skills into the Space, creates the agent record
 * from the template's suggested config, and — when requested — hands off to
 * the fleet for a hosted deploy.
 */

const skillValidator = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  content: v.string(),
  tags: v.optional(v.array(v.string())),
});

// --- Browse ------------------------------------------------------------------

/**
 * Curated public templates (visibility "public") plus this Space's private
 * snapshots (visibility "space"), optionally filtered by category. Curated
 * templates are global (no spaceId), so they're visible to every Space.
 */
export const listTemplates = query({
  args: {
    spaceId: v.id("spaces"),
    category: v.optional(v.string()),
    featuredOnly: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, { spaceId, category, featuredOnly, search }) => {
    await resolveScope(ctx, spaceId);

    // "custom" is the UI's "Your Space" tab: it means "my private snapshots",
    // not a literal `category === "custom"` filter, so it's handled
    // separately from the public-template category filter below.
    const wantsSpaceTab = category === "custom";

    const publicTemplates =
      category && !wantsSpaceTab
        ? await ctx.db
            .query("agentTemplates")
            .withIndex("by_visibility_category", (q) =>
              q.eq("visibility", "public").eq("category", category),
            )
            .collect()
        : wantsSpaceTab
          ? []
          : await ctx.db
              .query("agentTemplates")
              .withIndex("by_visibility", (q) => q.eq("visibility", "public"))
              .collect();

    // Space-private snapshots: always eligible for "all" and "custom"; for a
    // specific public category, only include a snapshot if it was itself
    // saved under that category (snapshots default to "custom" — see
    // snapshotAgent — so in practice this only surfaces user-recategorized
    // snapshots, never bleeds into every category tab).
    const spaceTemplatesRaw = await ctx.db
      .query("agentTemplates")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const spaceTemplates =
      category && !wantsSpaceTab
        ? spaceTemplatesRaw.filter((t) => (t.category ?? undefined) === category)
        : spaceTemplatesRaw;

    let all = [...publicTemplates, ...spaceTemplates];
    if (featuredOnly) all = all.filter((t) => t.featured);
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      all = all.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.tagline ?? "").toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.category ?? "").toLowerCase().includes(q) ||
          (t.capabilities ?? []).some((c) => c.toLowerCase().includes(q)),
      );
    }
    return all.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getTemplate = query({
  args: { spaceId: v.id("spaces"), templateId: v.id("agentTemplates") },
  handler: async (ctx, { spaceId, templateId }) => {
    await resolveScope(ctx, spaceId);
    const t = await ctx.db.get(templateId);
    if (!t) return null;
    // Visible if globally public, or a private snapshot owned by this Space.
    if (t.visibility === "public") return t;
    if (t.spaceId === spaceId) return t;
    return null;
  },
});

// --- Snapshot (feature 9): save a live agent as a Space-private template ----

export const snapshotAgent = mutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    name: v.string(),
    tagline: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { spaceId, agentId, name, tagline, description }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Agent not found");

    const skillRows = await ctx.db
      .query("skills")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();

    const now = Date.now();
    const slug = `${slugify(name)}-${now.toString(36)}`;
    const templateId = await ctx.db.insert("agentTemplates", {
      companyId: scope.companyId,
      spaceId,
      slug,
      name,
      tagline,
      description,
      category: "custom",
      visibility: "space",
      harness: agent.harness ?? agent.framework,
      suggestedModel: agent.model,
      systemPrompt: agent.systemPrompt,
      toolsets: agent.toolsets,
      capabilities: agent.capabilities,
      sourceAgentId: agentId,
      author: scope.userId,
      version: "1.0.0",
      installCount: 0,
      createdBy: scope.userId,
      createdAt: now,
      updatedAt: now,
      // Only include skills that look agent-relevant by tag overlap; keep it
      // simple and inclusive for now — cap to a sane bundle size.
      skills: skillRows.slice(0, 25).map((s) => ({
        name: s.name,
        description: s.description,
        content: s.content,
        tags: s.tags,
      })),
    });

    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "governance",
      action: "template_snapshotted",
      summary: `Saved "${agent.name}" as template "${name}"`,
    });
    return templateId;
  },
});

// --- Install -------------------------------------------------------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export const loadTemplateForInstall = internalQuery({
  args: {
    spaceId: v.id("spaces"),
    templateId: v.id("agentTemplates"),
    // Explicit caller choice from the install UI takes precedence over the
    // template's suggested-by-name resolution below — lets an operator
    // attach a different (or no) security profile than the template author
    // suggested, e.g. because the suggested profile name doesn't exist yet
    // in this Space, or the Space has stricter policy.
    securityProfileIdOverride: v.optional(v.id("securityProfiles")),
  },
  handler: async (ctx, { spaceId, templateId, securityProfileIdOverride }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const t = await ctx.db.get(templateId);
    if (!t) throw new Error("Template not found");
    if (t.visibility !== "public" && t.spaceId !== spaceId) {
      throw new Error("Template not found");
    }

    let securityProfileId: Id<"securityProfiles"> | undefined;
    if (securityProfileIdOverride) {
      const p = await ctx.db.get(securityProfileIdOverride);
      if (!p || p.spaceId !== spaceId) {
        throw new Error("Security profile not found in this Space");
      }
      securityProfileId = securityProfileIdOverride;
    } else if (t.securityProfileName) {
      const profile = await ctx.db
        .query("securityProfiles")
        .withIndex("by_space_name", (q) =>
          q.eq("spaceId", spaceId).eq("name", t.securityProfileName as string),
        )
        .unique();
      securityProfileId = profile?._id;
    }
    return { template: t, companyId: scope.companyId, securityProfileId };
  },
});

export const cloneSkills = internalMutation({
  args: { spaceId: v.id("spaces"), templateId: v.id("agentTemplates") },
  handler: async (ctx, { spaceId, templateId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const t = await ctx.db.get(templateId);
    if (!t || !t.skills || t.skills.length === 0) return [];
    const now = Date.now();
    const existing = await ctx.db
      .query("skills")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const existingNames = new Set(existing.map((s) => s.name));
    const ids: Id<"skills">[] = [];
    for (const s of t.skills) {
      if (existingNames.has(s.name)) continue; // don't clobber a same-named skill
      const id = await ctx.db.insert("skills", {
        companyId: scope.companyId,
        spaceId,
        name: s.name,
        description: s.description,
        content: s.content,
        tags: s.tags,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const createAgentFromTemplate = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    templateId: v.id("agentTemplates"),
    name: v.string(),
    squadId: v.optional(v.id("squads")),
    securityProfileId: v.optional(v.id("securityProfiles")),
    tokenHash: v.string(),
  },
  handler: async (ctx, { spaceId, templateId, name, squadId, securityProfileId, tokenHash }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const t = await ctx.db.get(templateId);
    if (!t) throw new Error("Template not found");

    const agentId = await ctx.db.insert("agents", {
      companyId: scope.companyId,
      spaceId,
      squadId,
      name,
      description: t.tagline ?? t.description,
      framework: t.harness,
      harness: t.harness,
      kind: "hermes",
      status: "pending",
      tokenHash,
      systemPrompt: t.systemPrompt,
      model: t.suggestedModel,
      toolsets: t.toolsets,
      capabilities: t.capabilities,
      securityProfileId,
      templateId,
      createdAt: Date.now(),
    });

    await ctx.db.patch(templateId, {
      installCount: (t.installCount ?? 0) + 1,
    });

    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "agent",
      action: "template_installed",
      summary: `Installed agent "${name}" from template "${t.name}"`,
    });

    return agentId;
  },
});

/**
 * Install a template into the Space: clones bundled skills, creates the agent
 * record wired to the template's suggested config + resolved security
 * profile, and — when `deployHosted` is set — hands off to the fleet for a
 * one-click hosted deploy (calling api.fleet.deploy defensively: if its
 * signature grows a new required arg upstream this call site needs updating,
 * but optional args are passed through untouched so this stays forward
 * compatible with additive changes).
 */
export const install = action({
  args: {
    spaceId: v.id("spaces"),
    templateId: v.id("agentTemplates"),
    name: v.optional(v.string()),
    squadId: v.optional(v.id("squads")),
    deployHosted: v.optional(v.boolean()),
    region: v.optional(v.string()),
    // Overrides the template's suggested `securityProfileName` resolution.
    // Pass an explicit id to attach a different profile, or omit to fall
    // back to the template's suggestion (if any resolves in this Space).
    securityProfileId: v.optional(v.id("securityProfiles")),
  },
  handler: async (
    ctx,
    { spaceId, templateId, name, squadId, deployHosted, region, securityProfileId: securityProfileIdOverride },
  ): Promise<{ agentId: Id<"agents">; skillsCloned: number; hosted: boolean; token?: string }> => {
    const { template, securityProfileId } = await ctx.runQuery(
      internal.marketplace.loadTemplateForInstall,
      { spaceId, templateId, securityProfileIdOverride },
    );

    const clonedSkillIds: Id<"skills">[] = await ctx.runMutation(
      internal.marketplace.cloneSkills,
      { spaceId, templateId },
    );

    const agentName = (name ?? template.name).trim() || template.name;

    if (deployHosted) {
      // Hosted install: let fleet.deploy provision the VM + agent record in
      // one shot so hosted-agent plan limits / BYOK / harness gating all stay
      // centralized in fleet.ts. `harness` is passed defensively — an
      // optional arg today; if fleet.deploy() ever requires more, this call
      // still typechecks against the current signature and the integrator
      // will flag drift.
      const res = await ctx.runAction(api.fleet.deploy, {
        spaceId,
        count: 1,
        namePrefix: agentName,
        squadId,
        model: template.suggestedModel,
        harness: template.harness,
        // Pass the resolved security profile straight into fleet.deploy so
        // its containerPolicy (egress allowlist / fs quota / secret scopes)
        // reaches the actual /spawn call. Previously this was only attached
        // post-hoc via attachTemplateMeta below, which patches the agent row
        // but does nothing for a container that already booted without the
        // policy — a real gap for hosted template installs specifically.
        securityProfileId,
      });
      const deployed = res.deployed[0];
      if (!deployed) throw new Error("Hosted deploy failed to provision an agent");
      await ctx.runMutation(internal.marketplace.attachTemplateMeta, {
        spaceId,
        agentId: deployed.agentId as Id<"agents">,
        templateId,
        securityProfileId,
      });
      return {
        agentId: deployed.agentId as Id<"agents">,
        skillsCloned: clonedSkillIds.length,
        hosted: true,
        token: deployed.token,
      };
    }

    // Non-hosted install: register a plain (self-connect) agent from the
    // template's suggested config.
    const { generateToken, sha256Hex } = await import("./lib/crypto");
    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const agentId: Id<"agents"> = await ctx.runMutation(
      internal.marketplace.createAgentFromTemplate,
      { spaceId, templateId, name: agentName, squadId, securityProfileId, tokenHash },
    );

    void region; // reserved for future non-hosted region hinting
    return { agentId, skillsCloned: clonedSkillIds.length, hosted: false, token };
  },
});

export const attachTemplateMeta = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    templateId: v.id("agentTemplates"),
    securityProfileId: v.optional(v.id("securityProfiles")),
  },
  handler: async (ctx, { spaceId, agentId, templateId, securityProfileId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return;
    await ctx.db.patch(agentId, { templateId, securityProfileId });
    const t = await ctx.db.get(templateId);
    if (t) {
      await ctx.db.patch(templateId, { installCount: (t.installCount ?? 0) + 1 });
    }
  },
});

// --- Seed curated templates (platform admin only) ---------------------------

type SeedTemplate = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  harness: string;
  suggestedModel: string;
  systemPrompt: string;
  toolsets: string[];
  capabilities: string[];
  skills: { name: string; description: string; content: string; tags: string[] }[];
  featured?: boolean;
};

const CURATED_TEMPLATES: SeedTemplate[] = [
  {
    slug: "sdr-outbound",
    name: "SDR Outbound Prospector",
    tagline: "Researches leads and drafts personalized outbound sequences",
    description:
      "An SDR agent that enriches lead lists, drafts multi-touch outbound sequences, and hands qualified replies to a human closer.",
    category: "sales",
    harness: "hermes",
    suggestedModel: "claude-sonnet",
    systemPrompt:
      "You are an SDR agent. Research each lead, personalize outreach based on public signals, and never fabricate facts about a prospect. Escalate any reply expressing interest to the sales lead via a work event.",
    toolsets: ["email", "crm", "web-search"],
    capabilities: ["email", "crm", "research"],
    featured: true,
    skills: [
      {
        name: "Outbound sequence playbook",
        description: "3-touch email sequence structure with personalization checkpoints",
        content:
          "Touch 1 (Day 0): one-line personalized hook referencing a real, recent, public signal about the company + a single clear ask.\nTouch 2 (Day 3): different angle, add one proof point (case study or metric), same ask.\nTouch 3 (Day 7): breakup email — short, low-pressure, leaves the door open.\nNever send more than 3 touches without a reply. Log every send as a work event.",
        tags: ["sales", "email"],
      },
      {
        name: "Lead qualification checklist",
        description: "BANT-style qualification before handoff",
        content:
          "Before escalating a reply to a human closer, confirm as much as you can find: Budget signal, Authority (title/seniority), Need (why now), Timeline. Note unknowns explicitly rather than guessing.",
        tags: ["sales", "qualification"],
      },
    ],
  },
  {
    slug: "support-triage",
    name: "Support Triage Agent",
    tagline: "Classifies, prioritizes, and drafts first-response replies to inbound support tickets",
    description:
      "Reads inbound support messages, classifies severity/category, drafts a first response, and escalates anything ambiguous or high-risk to a human.",
    category: "support",
    harness: "hermes",
    suggestedModel: "claude-sonnet",
    systemPrompt:
      "You are a support triage agent. Classify each ticket's severity and category, draft a helpful first response grounded only in the provided knowledge base, and escalate (never guess) when you're not confident or the issue involves billing, security, or legal.",
    toolsets: ["helpdesk", "knowledge-base"],
    capabilities: ["support", "triage"],
    featured: true,
    skills: [
      {
        name: "Severity rubric",
        description: "P0-P3 severity classification",
        content:
          "P0: production down / data loss / security incident — page a human immediately, do not attempt a fix.\nP1: major feature broken for many users — escalate within 1 hour.\nP2: feature broken for one user with a workaround — respond within 1 business day.\nP3: question / cosmetic — respond when convenient, no escalation needed.",
        tags: ["support", "triage"],
      },
      {
        name: "First-response template",
        description: "Structure for an empathetic, accurate first reply",
        content:
          "1) Acknowledge the specific issue in your own words (proves you read it).\n2) Answer from the knowledge base if you have a grounded answer; otherwise say what you're checking and by when.\n3) Never invent a fix, workaround, or ETA you can't verify.\n4) Close with a clear next step, even if it's 'a teammate will follow up.'",
        tags: ["support"],
      },
    ],
  },
  {
    slug: "code-reviewer",
    name: "Code Reviewer",
    tagline: "Reviews pull requests for correctness, security, and style before a human merges",
    description:
      "Reviews diffs for correctness bugs, security issues, and simplification opportunities. Comments with concrete failure scenarios, never rubber-stamps.",
    category: "engineering",
    harness: "hermes",
    suggestedModel: "claude-opus",
    systemPrompt:
      "You are a senior code reviewer. Focus on correctness bugs and security issues first, then simplification. For every finding, describe a concrete input/state that triggers the failure — never report vague style nits as if they were bugs. If the diff looks correct, say so plainly instead of inventing findings.",
    toolsets: ["github", "code-search"],
    capabilities: ["code-gen", "code-review"],
    featured: true,
    skills: [
      {
        name: "Review checklist",
        description: "What to check on every diff",
        content:
          "1. Correctness: does every changed code path handle its edge cases (empty, null, concurrent, unauthorized)?\n2. Security: injection, authz bypass, secret leakage, SSRF, unsafe deserialization.\n3. Tests: does the diff have coverage for the new/changed behavior?\n4. Simplification: is there duplicated logic that should reuse an existing helper?\nRank findings most-severe first. Empty findings list is a valid, good outcome.",
        tags: ["engineering", "review"],
      },
    ],
  },
  {
    slug: "ops-monitor",
    name: "Ops Monitor",
    tagline: "Watches fleet health, error rates, and budgets, and pages a human when something's wrong",
    description:
      "A standing ops agent that watches agent health, error spikes, dead letters, and budget burn, and raises alerts before small issues become incidents.",
    category: "ops",
    harness: "hermes",
    suggestedModel: "claude-haiku",
    systemPrompt:
      "You are an ops monitoring agent. Periodically review fleet health, error rates, dead letters, and budget burn. Summarize anomalies concisely and raise an alert (never silently fix production issues yourself) when a metric crosses a concerning threshold.",
    toolsets: ["observability"],
    capabilities: ["ops", "monitoring"],
    skills: [
      {
        name: "Incident triage priorities",
        description: "What to check first during an anomaly",
        content:
          "Order of investigation: 1) error rate spike in the last hour, 2) agents gone offline/degraded, 3) dead-letter queue growth, 4) budget burn rate vs monthly cap. Always link the specific rows/metrics you're citing, don't summarize from memory.",
        tags: ["ops"],
      },
    ],
  },
  {
    slug: "content-drafter",
    name: "Content Drafter",
    tagline: "Turns briefs into first-draft blog posts, social copy, and release notes",
    description:
      "Takes a short brief and produces a structured first draft (blog post, social thread, or release notes) in the brand voice supplied in context, ready for human edit.",
    category: "marketing",
    harness: "hermes",
    suggestedModel: "claude-sonnet",
    systemPrompt:
      "You are a content drafting agent. Produce clear, well-structured first drafts from a brief. Flag any factual claim you're not certain of instead of stating it as fact. You are drafting for human review, not final publication.",
    toolsets: ["web-search"],
    capabilities: ["content", "writing"],
    skills: [
      {
        name: "Brief-to-draft structure",
        description: "How to turn a short brief into a structured draft",
        content:
          "1. Restate the goal and audience in one line to confirm understanding.\n2. Outline sections/headers before writing prose.\n3. Write the draft, marking any unverified claim with [VERIFY].\n4. End with 2-3 open questions for the human editor.",
        tags: ["marketing", "writing"],
      },
    ],
  },
];

/** Idempotent: only inserts templates whose slug isn't already seeded. */
export const seedInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("agentTemplates").withIndex("by_slug").collect();
    const existingSlugs = new Set(existing.map((t) => t.slug));
    const now = Date.now();
    let inserted = 0;
    for (const tpl of CURATED_TEMPLATES) {
      if (existingSlugs.has(tpl.slug)) continue;
      await ctx.db.insert("agentTemplates", {
        slug: tpl.slug,
        name: tpl.name,
        tagline: tpl.tagline,
        description: tpl.description,
        category: tpl.category,
        visibility: "public",
        featured: tpl.featured ?? false,
        harness: tpl.harness,
        suggestedModel: tpl.suggestedModel,
        systemPrompt: tpl.systemPrompt,
        toolsets: tpl.toolsets,
        capabilities: tpl.capabilities,
        skills: tpl.skills,
        author: "Cadre",
        version: "1.0.0",
        installCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      inserted += 1;
    }
    return { inserted, total: CURATED_TEMPLATES.length };
  },
});

/** Platform-admin entrypoint to (re)seed the curated marketplace templates. */
export const seed = mutation({
  args: {},
  handler: async (ctx): Promise<{ inserted: number; total: number }> => {
    const admin = await requirePlatformAdmin(ctx);
    const result: { inserted: number; total: number } = await ctx.runMutation(
      internal.marketplace.seedInternal,
      {},
    );
    await auditAdmin(ctx, admin, {
      action: "marketplace_seed",
      resource: "agentTemplates",
      detail: `Inserted ${result.inserted}/${result.total} curated templates`,
    });
    return result;
  },
});
