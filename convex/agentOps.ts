import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";
import { generateToken, sha256Hex } from "./lib/crypto";
import { hostedAgentLimit, PLAN_LIMITS } from "./lib/plans";
import { cloudflareConfigured, spawnAgent, terminateAgent } from "./lib/cloudflare";

// ===========================================================================
// Feature 7 — Remote config push. Desired (pendingConfig) vs applied
// (appliedConfig) live on the agents row (agentRuntimeConfigValidator,
// convex/schema.ts). The connector polls for pending config and acks once
// applied; drift is simply pendingConfig.version > (appliedConfig?.version).
//
// Cross-team request (Team E / http.ts): wire two token-authenticated routes
// the same way /connector/heartbeat is wired —
//   POST /connector/config/poll  -> internal.agentOps.pollPendingConfig({agentId})
//   POST /connector/config/ack   -> internal.agentOps.ackConfig({agentId, version})
// ===========================================================================

const configPatchValidator = {
  model: v.optional(v.string()),
  systemPrompt: v.optional(v.string()),
  toolAllowlist: v.optional(v.array(v.string())),
  envOverrides: v.optional(v.record(v.string(), v.string())),
};

/** Push a new desired config for an agent. The connector applies it and acks. */
export const pushConfig = mutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    ...configPatchValidator,
  },
  handler: async (ctx, { spaceId, agentId, ...patch }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");

    const noFields =
      patch.model === undefined &&
      patch.systemPrompt === undefined &&
      patch.toolAllowlist === undefined &&
      patch.envOverrides === undefined;
    if (noFields) throw new Error("Provide at least one field to change");

    const baseVersion = agent.pendingConfig?.version ?? agent.appliedConfig?.version ?? 0;
    const base = agent.pendingConfig ?? agent.appliedConfig;
    const pendingConfig = {
      version: baseVersion + 1,
      model: patch.model ?? base?.model,
      systemPrompt: patch.systemPrompt ?? base?.systemPrompt,
      toolAllowlist: patch.toolAllowlist ?? base?.toolAllowlist,
      envOverrides: patch.envOverrides ?? base?.envOverrides,
      updatedBy: scope.userId,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(agentId, { pendingConfig });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "agent",
      action: "config_pushed",
      summary: `Pushed config v${pendingConfig.version} to ${agent.name}`,
      payload: { version: pendingConfig.version },
    });
    return { version: pendingConfig.version };
  },
});

/** Discard the pending config, reverting the UI back to the last applied state. */
export const cancelPendingConfig = mutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(agentId, { pendingConfig: undefined });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "agent",
      action: "config_push_cancelled",
      summary: `Cancelled pending config for ${agent.name}`,
    });
  },
});

/** Drift view for the UI: is there an un-applied config, and what's in each side. */
export const configDrift = query({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }) => {
    await resolveScope(ctx, spaceId);
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return null;
    const pending = agent.pendingConfig ?? null;
    const applied = agent.appliedConfig ?? null;
    const drift = !!pending && pending.version !== (applied?.version ?? -1);
    return { pending, applied, drift, configAckedAt: agent.configAckedAt ?? null };
  },
});

/** Connector-facing: fetch pending config if newer than what's applied. Token-authenticated by the caller (http.ts). */
export const pollPendingConfig = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent?.pendingConfig) return null;
    if (agent.pendingConfig.version === (agent.appliedConfig?.version ?? -1)) return null;
    return agent.pendingConfig;
  },
});

/** Connector-facing: ack that a given config version was applied. */
export const ackConfig = internalMutation({
  args: { agentId: v.id("agents"), version: v.number() },
  handler: async (ctx, { agentId, version }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || !agent.pendingConfig) return { ok: false };
    if (agent.pendingConfig.version !== version) return { ok: false, staleVersion: true };
    const applied = agent.pendingConfig;
    // Keep the agent's live persona fields in sync with what's actually running.
    await ctx.db.patch(agentId, {
      appliedConfig: applied,
      configAckedAt: Date.now(),
      model: applied.model ?? agent.model,
      systemPrompt: applied.systemPrompt ?? agent.systemPrompt,
      toolsets: applied.toolAllowlist ?? agent.toolsets,
    });
    await recordWorkEvent(ctx, {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      actorType: "agent",
      actorId: String(agentId),
      agentId,
      category: "agent",
      action: "config_acked",
      summary: `${agent.name} applied config v${version}`,
      payload: { version },
    });
    return { ok: true };
  },
});

// ===========================================================================
// Feature 9 — Snapshots / cloning. Capture a live agent's config into an
// agentTemplates row (space-visibility, sourceAgentId set), then deploy N new
// agents stamped from it (mirrors fleet.deploy's provisioning, but sourced
// from a template instead of raw args).
// ===========================================================================

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return `${base || "agent"}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Snapshot a live agent's config + toolset into a reusable template. */
export const snapshotAgent = mutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { spaceId, agentId, name, description }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");

    const templateName = (name ?? `${agent.name} snapshot`).trim() || `${agent.name} snapshot`;
    const now = Date.now();
    const templateId = await ctx.db.insert("agentTemplates", {
      companyId: scope.companyId,
      spaceId,
      slug: slugify(templateName),
      name: templateName,
      description,
      visibility: "space",
      harness: agent.harness,
      suggestedModel: agent.appliedConfig?.model ?? agent.model,
      systemPrompt: agent.appliedConfig?.systemPrompt ?? agent.systemPrompt,
      toolsets: agent.appliedConfig?.toolAllowlist ?? agent.toolsets,
      capabilities: agent.capabilities,
      suggestedConfig: agent.appliedConfig?.envOverrides
        ? { envOverrides: agent.appliedConfig.envOverrides }
        : undefined,
      sourceAgentId: agentId,
      author: scope.userId,
      installCount: 0,
      createdBy: scope.userId,
      createdAt: now,
      updatedAt: now,
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "agent",
      action: "snapshotted",
      summary: `Snapshotted ${agent.name} into template "${templateName}"`,
      payload: { templateId },
    });
    return templateId;
  },
});

/** Templates available to a Space: its own snapshots + curated public ones. */
export const listTemplates = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const own = await ctx.db
      .query("agentTemplates")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const publicTemplates = await ctx.db
      .query("agentTemplates")
      .withIndex("by_visibility", (q) => q.eq("visibility", "public"))
      .take(100);
    return [...own, ...publicTemplates].sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const removeTemplate = mutation({
  args: { spaceId: v.id("spaces"), templateId: v.id("agentTemplates") },
  handler: async (ctx, { spaceId, templateId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const t = await ctx.db.get(templateId);
    if (!t || t.spaceId !== spaceId) throw new Error("Not found (only space-owned templates can be removed)");
    await ctx.db.delete(templateId);
  },
});

export const assertOperator = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    return { companyId: scope.companyId };
  },
});

export const getTemplateForDeploy = internalQuery({
  args: { spaceId: v.id("spaces"), templateId: v.id("agentTemplates") },
  handler: async (ctx, { spaceId, templateId }) => {
    const t = await ctx.db.get(templateId);
    if (!t) return null;
    // Space-private templates must belong to this Space; public ones are open.
    if (t.spaceId && t.spaceId !== spaceId) return null;
    return t;
  },
});

export const checkHostedCapacityForClone = internalQuery({
  args: { spaceId: v.id("spaces"), requested: v.number() },
  handler: async (ctx, { spaceId, requested }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const limit = hostedAgentLimit(scope);
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const existing = agents.filter(
      (a) => a.vmProvider && (a.deploymentStatus === "provisioning" || a.deploymentStatus === "running"),
    ).length;
    if (existing + requested > limit) {
      throw new Error(
        `Hosted agent limit reached for the current plan (${limit}); ${existing} already provisioning/running, requested ${requested} more.`,
      );
    }
    return { companyId: scope.companyId };
  },
});

export const insertClonedAgent = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    tokenHash: v.string(),
    vmId: v.optional(v.string()),
    region: v.optional(v.string()),
    templateId: v.id("agentTemplates"),
    model: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    toolsets: v.optional(v.array(v.string())),
    harness: v.optional(v.string()),
    squadId: v.optional(v.id("squads")),
    reportsTo: v.optional(v.id("agents")),
    deploymentStatus: v.union(
      v.literal("provisioning"),
      v.literal("running"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, { spaceId, templateId, ...rest }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agentId = await ctx.db.insert("agents", {
      companyId: scope.companyId,
      spaceId,
      kind: "hermes",
      status: "pending",
      vmProvider: "cloudflare",
      templateId,
      createdAt: Date.now(),
      ...rest,
    });
    const template = await ctx.db.get(templateId);
    if (template) {
      await ctx.db.patch(templateId, { installCount: (template.installCount ?? 0) + 1 });
    }
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "agent",
      action: "cloned_from_template",
      summary: `Deployed ${rest.name} from template`,
      payload: { templateId },
    });
    return agentId;
  },
});

function controlPlaneUrl(): string {
  return process.env.CONVEX_SITE_URL ?? "";
}

/** Deploy N new agents stamped from a template ("deploy-N-like-this"). */
export const deployFromTemplate = action({
  args: {
    spaceId: v.id("spaces"),
    templateId: v.id("agentTemplates"),
    count: v.number(),
    namePrefix: v.optional(v.string()),
    region: v.optional(v.string()),
    squadId: v.optional(v.id("squads")),
    reportsTo: v.optional(v.id("agents")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ cloudflare: boolean; deployed: { agentId: string; name: string; token: string }[] }> => {
    const n = Math.max(1, Math.min(args.count, 25));
    const template = await ctx.runQuery(internal.agentOps.getTemplateForDeploy, {
      spaceId: args.spaceId,
      templateId: args.templateId,
    });
    if (!template) throw new Error("Template not found");
    await ctx.runQuery(internal.agentOps.checkHostedCapacityForClone, {
      spaceId: args.spaceId,
      requested: n,
    });

    const configured = cloudflareConfigured();
    const prefix = (args.namePrefix ?? template.name).trim() || "Agent";
    const deployed: { agentId: string; name: string; token: string }[] = [];

    for (let i = 0; i < n; i++) {
      const name = n === 1 ? prefix : `${prefix} ${i + 1}`;
      const token = generateToken();
      const tokenHash = await sha256Hex(token);
      let vmId: string | undefined;
      let status: "provisioning" | "running" | "failed" = "provisioning";

      if (configured) {
        try {
          const res = await spawnAgent({
            token,
            controlPlaneUrl: controlPlaneUrl(),
            region: args.region,
            model: template.suggestedModel,
            name,
          });
          vmId = res.vmId;
          status = "running";
        } catch {
          status = "failed";
        }
      }

      const agentId: string = await ctx.runMutation(internal.agentOps.insertClonedAgent, {
        spaceId: args.spaceId,
        name,
        tokenHash,
        vmId,
        region: args.region,
        templateId: args.templateId,
        model: template.suggestedModel,
        systemPrompt: template.systemPrompt,
        toolsets: template.toolsets,
        harness: template.harness,
        squadId: args.squadId,
        reportsTo: args.reportsTo,
        deploymentStatus: status,
      });
      deployed.push({ agentId, name, token });
    }

    return { cloudflare: configured, deployed };
  },
});

// ===========================================================================
// Feature 8 — Squad autoscaling: config surface (setSquadAutoscale) + the
// pure decision function (decideScale) + the cron-driven evaluate/spawn/
// terminate engine (evaluateAutoscale, below squadLoadSnapshot).
// ===========================================================================

export const setSquadAutoscale = mutation({
  args: {
    spaceId: v.id("spaces"),
    squadId: v.id("squads"),
    enabled: v.boolean(),
    minAgents: v.number(),
    maxAgents: v.number(),
    queueDepthPerAgent: v.number(),
    cooldownMinutes: v.number(),
    templateId: v.optional(v.id("agentTemplates")),
    harness: v.optional(v.string()),
  },
  handler: async (ctx, { spaceId, squadId, ...cfg }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const squad = await ctx.db.get(squadId);
    if (!squad || squad.spaceId !== spaceId) throw new Error("Not found");
    if (cfg.minAgents < 0 || cfg.maxAgents < cfg.minAgents) {
      throw new Error("maxAgents must be >= minAgents >= 0");
    }
    await ctx.db.patch(squadId, {
      autoscale: {
        ...cfg,
        lastScaleAt: squad.autoscale?.lastScaleAt,
        lastScaleDirection: squad.autoscale?.lastScaleDirection,
        lastEvaluatedAt: squad.autoscale?.lastEvaluatedAt,
      },
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "governance",
      action: "autoscale_configured",
      summary: `${cfg.enabled ? "Enabled" : "Disabled"} autoscaling for squad "${squad.name}" (${cfg.minAgents}-${cfg.maxAgents}, ${cfg.queueDepthPerAgent}/agent)`,
      payload: { squadId, ...cfg },
    });
  },
});

/**
 * Pure decision function for squad autoscaling — no I/O, unit-testable.
 * queueDepth / onlineAgents vs queueDepthPerAgent, with hysteresis (scale down
 * only once load drops to half the trigger) and cooldown honored by the caller.
 */
export function decideScale(input: {
  queueDepth: number;
  onlineAgents: number;
  minAgents: number;
  maxAgents: number;
  queueDepthPerAgent: number;
}): "up" | "down" | "hold" {
  const { queueDepth, onlineAgents, minAgents, maxAgents, queueDepthPerAgent } = input;
  const ratio = queueDepth / Math.max(onlineAgents, 1);
  if (ratio > queueDepthPerAgent && onlineAgents < maxAgents) return "up";
  if (ratio < queueDepthPerAgent / 2 && onlineAgents > minAgents) return "down";
  return "hold";
}

/** Snapshot of one squad's load for the autoscale decision. */
export const squadLoadSnapshot = internalQuery({
  args: { squadId: v.id("squads") },
  handler: async (ctx, { squadId }) => {
    const squad = await ctx.db.get(squadId);
    if (!squad) return null;
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_squad", (q) => q.eq("squadId", squadId))
      .take(500);
    const online = agents.filter((a) => a.status === "online" || a.status === "degraded").length;
    const tasksTodo = await ctx.db
      .query("tasks")
      .withIndex("by_space_status", (q) => q.eq("spaceId", squad.spaceId).eq("status", "todo"))
      .take(500);
    const tasksInProgress = await ctx.db
      .query("tasks")
      .withIndex("by_space_status", (q) => q.eq("spaceId", squad.spaceId).eq("status", "in_progress"))
      .take(500);
    const queueDepth =
      tasksTodo.filter((t) => t.squadId === squadId).length +
      tasksInProgress.filter((t) => t.squadId === squadId).length;
    return { squad, onlineAgents: online, queueDepth };
  },
});

// ===========================================================================
// Feature 8 (cont'd) — the evaluate/spawn/terminate engine. `evaluateAutoscale`
// is the cron entry point; it paginates every squad with autoscale.enabled,
// applies `decideScale` against a fresh load snapshot, and — respecting
// cooldownMinutes — provisions or terminates exactly one agent per squad per
// tick. Deliberately does NOT touch fleet.ts (Team A's file): capacity
// checking + insertion is reimplemented here as a system actor (no user
// identity on a cron tick), same pattern as deployFromTemplate/
// insertClonedAgent above. Scaled-up agents are tagged `meta.autoscaled` so
// scale-down only ever reclaims agents the autoscaler itself created, never a
// human-provisioned one.
//
// Cross-team request (integrator, crons.ts is shared): register
//   crons.interval("squad autoscale", { minutes: 5 }, internal.agentOps.evaluateAutoscale, {})
// ===========================================================================

function hostedLimitForPlan(plan: string | undefined): number {
  const p = plan === "team" || plan === "enterprise" ? plan : "free";
  return PLAN_LIMITS[p].hostedAgents;
}

/** Every squad with autoscale enabled, one page at a time (system-wide cron sweep). */
export const listAutoscaleSquadsPage = internalQuery({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("squads")
      .paginate({ numItems: 200, cursor: cursor ?? null });
    return {
      squads: page.page.filter((s) => s.autoscale?.enabled),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/** Hosted-agent headroom for a Space against its plan, computed without a user identity. */
export const hostedAgentCountForSpace = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const space = await ctx.db.get(spaceId);
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const existing = agents.filter(
      (a) => a.vmProvider && (a.deploymentStatus === "provisioning" || a.deploymentStatus === "running"),
    ).length;
    return { existing, limit: hostedLimitForPlan(space?.plan) };
  },
});

/** Least-recently-active autoscaler-owned agent in a squad, i.e. the safest one to reclaim. */
export const pickScaleDownCandidate = internalQuery({
  args: { squadId: v.id("squads") },
  handler: async (ctx, { squadId }) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_squad", (q) => q.eq("squadId", squadId))
      .take(500);
    const candidates = agents.filter(
      (a) =>
        a.vmId &&
        a.vmProvider &&
        a.deploymentStatus === "running" &&
        (a.meta as { autoscaled?: boolean } | undefined)?.autoscaled === true,
    );
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => (a.lastHeartbeat ?? a.createdAt) - (b.lastHeartbeat ?? b.createdAt));
    return candidates[0];
  },
});

/** Provision one system-actor agent stamped from the squad's autoscale template. */
export const provisionScaleAgent = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    squadId: v.id("squads"),
    templateId: v.id("agentTemplates"),
    name: v.string(),
    tokenHash: v.string(),
    vmId: v.optional(v.string()),
    harness: v.optional(v.string()),
    deploymentStatus: v.union(
      v.literal("provisioning"),
      v.literal("running"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, { spaceId, squadId, templateId, ...rest }) => {
    const space = await ctx.db.get(spaceId);
    if (!space) return null;
    const template = await ctx.db.get(templateId);
    const agentId = await ctx.db.insert("agents", {
      companyId: space.companyId,
      spaceId,
      squadId,
      kind: "hermes",
      status: "pending",
      vmProvider: "cloudflare",
      templateId,
      model: template?.suggestedModel,
      systemPrompt: template?.systemPrompt,
      toolsets: template?.toolsets,
      harness: rest.harness ?? template?.harness,
      meta: { autoscaled: true },
      createdAt: Date.now(),
      ...rest,
    });
    if (template) {
      await ctx.db.patch(templateId, { installCount: (template.installCount ?? 0) + 1 });
    }
    await recordWorkEvent(ctx, {
      companyId: space.companyId,
      spaceId,
      actorType: "system",
      agentId,
      category: "agent",
      action: "autoscaled_up",
      summary: `Autoscale provisioned ${rest.name} for squad load`,
      payload: { squadId, templateId },
    });
    return agentId;
  },
});

/** Reclaim one autoscaler-owned agent (already terminated on the provider side by the caller). */
export const markScaleTerminated = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent) return;
    await ctx.db.patch(agentId, { deploymentStatus: "stopped", status: "offline" });
    await recordWorkEvent(ctx, {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      actorType: "system",
      agentId,
      category: "agent",
      action: "autoscaled_down",
      summary: `Autoscale terminated ${agent.name} (queue slack)`,
      payload: { squadId: agent.squadId },
    });
  },
});

/** Stamp a squad's autoscale bookkeeping (lastEvaluatedAt always; lastScaleAt/Direction only when it actually scaled). */
export const recordAutoscaleEvaluation = internalMutation({
  args: {
    squadId: v.id("squads"),
    direction: v.union(v.literal("up"), v.literal("down"), v.literal("hold")),
    scaled: v.boolean(),
  },
  handler: async (ctx, { squadId, direction, scaled }) => {
    const squad = await ctx.db.get(squadId);
    if (!squad?.autoscale) return;
    const now = Date.now();
    await ctx.db.patch(squadId, {
      autoscale: {
        ...squad.autoscale,
        lastEvaluatedAt: now,
        ...(scaled ? { lastScaleAt: now, lastScaleDirection: direction } : {}),
      },
    });
  },
});

/**
 * Cron-safe evaluate/scale engine. Idempotent-ish per tick: cooldown is
 * honored per-squad, and every squad advances by at most one agent per tick
 * (steady, observable scaling rather than a thundering herd).
 */
export const evaluateAutoscale = internalAction({
  args: {},
  handler: async (ctx) => {
    const configured = cloudflareConfigured();
    let cursor: string | null = null;
    let evaluated = 0;
    let scaled = 0;

    do {
      const page: {
        squads: Doc<"squads">[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.agentOps.listAutoscaleSquadsPage, { cursor });

      for (const squad of page.squads) {
        const cfg = squad.autoscale;
        if (!cfg?.enabled) continue;
        const now = Date.now();
        if (cfg.lastScaleAt && now - cfg.lastScaleAt < cfg.cooldownMinutes * 60_000) {
          continue; // cooling down from the last scale event
        }

        const snap: { squad: Doc<"squads">; onlineAgents: number; queueDepth: number } | null =
          await ctx.runQuery(internal.agentOps.squadLoadSnapshot, { squadId: squad._id });
        if (!snap) continue;
        evaluated++;

        const decision = decideScale({
          queueDepth: snap.queueDepth,
          onlineAgents: snap.onlineAgents,
          minAgents: cfg.minAgents,
          maxAgents: cfg.maxAgents,
          queueDepthPerAgent: cfg.queueDepthPerAgent,
        });

        if (decision === "hold") {
          await ctx.runMutation(internal.agentOps.recordAutoscaleEvaluation, {
            squadId: squad._id,
            direction: "hold",
            scaled: false,
          });
          continue;
        }

        if (decision === "up") {
          if (!cfg.templateId) {
            // Can't scale up without a template to stamp from — hold and let
            // the operator wire one up via setSquadAutoscale.
            await ctx.runMutation(internal.agentOps.recordAutoscaleEvaluation, {
              squadId: squad._id,
              direction: "hold",
              scaled: false,
            });
            continue;
          }
          const cap: { existing: number; limit: number } = await ctx.runQuery(
            internal.agentOps.hostedAgentCountForSpace,
            { spaceId: squad.spaceId },
          );
          if (cap.existing >= cap.limit) {
            await ctx.runMutation(internal.agentOps.recordAutoscaleEvaluation, {
              squadId: squad._id,
              direction: "hold",
              scaled: false,
            });
            continue;
          }

          const name = `${squad.name} auto-${now.toString(36).slice(-5)}`;
          const token = generateToken();
          const tokenHash = await sha256Hex(token);
          let vmId: string | undefined;
          let status: "provisioning" | "running" | "failed" = "provisioning";
          if (configured) {
            try {
              const res = await spawnAgent({
                token,
                controlPlaneUrl: controlPlaneUrl(),
                name,
                harness: cfg.harness,
              });
              vmId = res.vmId;
              status = "running";
            } catch {
              status = "failed";
            }
          }
          await ctx.runMutation(internal.agentOps.provisionScaleAgent, {
            spaceId: squad.spaceId,
            squadId: squad._id,
            templateId: cfg.templateId,
            name,
            tokenHash,
            vmId,
            harness: cfg.harness,
            deploymentStatus: status,
          });
          await ctx.runMutation(internal.agentOps.recordAutoscaleEvaluation, {
            squadId: squad._id,
            direction: "up",
            scaled: true,
          });
          scaled++;
        } else {
          const candidate: Doc<"agents"> | null = await ctx.runQuery(
            internal.agentOps.pickScaleDownCandidate,
            { squadId: squad._id },
          );
          if (!candidate) {
            // Nothing the autoscaler owns to reclaim (all agents were
            // manually provisioned) — hold rather than touch human-managed
            // capacity.
            await ctx.runMutation(internal.agentOps.recordAutoscaleEvaluation, {
              squadId: squad._id,
              direction: "hold",
              scaled: false,
            });
            continue;
          }
          if (configured && candidate.vmId) {
            try {
              await terminateAgent(candidate.vmId);
            } catch {
              // best-effort; still reclaim the row so the fleet count is accurate
            }
          }
          await ctx.runMutation(internal.agentOps.markScaleTerminated, { agentId: candidate._id });
          await ctx.runMutation(internal.agentOps.recordAutoscaleEvaluation, {
            squadId: squad._id,
            direction: "down",
            scaled: true,
          });
          scaled++;
        }
      }

      cursor = page.isDone ? null : page.continueCursor;
    } while (cursor);

    return { evaluated, scaled };
  },
});
