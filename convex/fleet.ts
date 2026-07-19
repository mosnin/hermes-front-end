import { v } from "convex/values";
import {
  query,
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";
import { generateToken, sha256Hex } from "./lib/crypto";
import { planOf, hostedAgentLimit } from "./lib/plans";
import {
  cloudflareConfigured,
  spawnAgent,
  terminateAgent,
  agentStatus,
  restartAgent,
  isKnownHarness,
  KNOWN_HARNESS_IDS,
  HARNESS_CATALOG,
  harnessCapabilities,
} from "./lib/cloudflare";

/** The control-plane URL deployed agents connect back to (Convex HTTP actions). */
function controlPlaneUrl(): string {
  return process.env.CONVEX_SITE_URL ?? "";
}

export const providerStatus = query({
  args: {},
  handler: async () => ({ cloudflare: cloudflareConfigured() }),
});

/**
 * Harness picker feed (feature 2): every built-in harness a hosted deploy can
 * boot, with the metadata a UI needs to render a picker — id, display name,
 * description, pinned version, and capability tags — without any team
 * needing to reach into connector/harnesses/** directly (convex/ can't
 * import outside convex/, see docs/HARNESS_SPEC.md). No auth required: this
 * is static catalog data, not Space-scoped.
 */
export const harnessCatalog = query({
  args: {},
  handler: async () => {
    return KNOWN_HARNESS_IDS.map((id) => ({ id, ...HARNESS_CATALOG[id] }));
  },
});

/** Deployed fleet agents (those provisioned onto a VM). */
export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return agents.filter((a) => a.vmProvider);
  },
});

/** Org chart: every agent with hierarchy + squad info. */
export const orgChart = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return agents.map((a) => ({
      id: a._id,
      name: a.name,
      status: a.status,
      reportsTo: a.reportsTo ?? null,
      squadId: a.squadId ?? null,
      vmProvider: a.vmProvider ?? null,
    }));
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

/**
 * Operator gate + per-plan hosted-agent ceiling for deploy: counts agents in
 * the Space that are already provisioned onto a VM (vmProvider set) and still
 * live (provisioning/running), and rejects the deploy if adding `requested`
 * more would cross the plan's limit.
 */
export const checkHostedCapacity = internalQuery({
  args: { spaceId: v.id("spaces"), requested: v.number() },
  handler: async (ctx, { spaceId, requested }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const plan = planOf(scope);
    const limit = hostedAgentLimit(scope);
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const existing = agents.filter(
      (a) =>
        a.vmProvider &&
        (a.deploymentStatus === "provisioning" || a.deploymentStatus === "running"),
    ).length;
    if (existing + requested > limit) {
      throw new Error(
        `Hosted agent limit reached for the ${plan} plan (${limit}); ` +
          `${existing} already provisioning/running, requested ${requested} more. Upgrade to add more.`,
      );
    }
    return { companyId: scope.companyId, plan };
  },
});

export const insertFleetAgent = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    tokenHash: v.string(),
    vmProvider: v.string(),
    vmId: v.optional(v.string()),
    region: v.optional(v.string()),
    model: v.optional(v.string()),
    squadId: v.optional(v.id("squads")),
    reportsTo: v.optional(v.id("agents")),
    deploymentStatus: v.union(
      v.literal("provisioning"),
      v.literal("running"),
      v.literal("stopped"),
      v.literal("failed"),
    ),
    // --- Harness-agnostic runtime (features 1,3,5) ---
    harness: v.optional(v.string()),
    harnessVersion: v.optional(v.string()),
    imageRef: v.optional(v.string()),
  },
  handler: async (ctx, { spaceId, ...rest }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agentId = await ctx.db.insert("agents", {
      companyId: scope.companyId,
      spaceId,
      kind: "hermes",
      status: "pending",
      createdAt: Date.now(),
      // `framework` kept for back-compat with pre-harness code paths; `harness`
      // is authoritative going forward (per architect schema notes).
      framework: rest.harness,
      // Feeds the A2A card/directory listing (capabilities.ts) with the real
      // framework capability tags for this harness, instead of leaving
      // `capabilities` empty for every fleet-hosted agent.
      capabilities: harnessCapabilities(rest.harness ?? "hermes"),
      ...rest,
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "agent",
      action: "fleet_deployed",
      summary: `Deployed ${rest.name} on ${rest.vmProvider}${
        rest.harness && rest.harness !== "hermes" ? ` (harness: ${rest.harness})` : ""
      }`,
    });
    return agentId;
  },
});

/**
 * One-click deploy: provision N agents onto Cloudflare and slot them into the
 * Space/Squad/hierarchy. If Cloudflare isn't configured, the agents are still
 * created (status "provisioning") and their one-time tokens returned so they
 * can be connected by hand.
 *
 * `harness` picks which agent-framework image the container boots — one of
 * KNOWN_HARNESS_IDS (default "hermes"), see docs/HARNESS_SPEC.md. `imageRef`
 * is BYO-image (enterprise plan only): an arbitrary container image ref that
 * bypasses `harness` entirely — see docs/HARNESS_SPEC.md's "BYO image"
 * section for the current Cloudflare Containers limitation on this path.
 * `agentCommand` is required when `harness === "generic-cli"` (that harness
 * has no default command and fails fast at boot without one) and optional
 * everywhere else — see docs/HARNESS_SPEC.md's "generic-cli requires
 * agentCommand" section.
 */
export const deploy = action({
  args: {
    spaceId: v.id("spaces"),
    count: v.number(),
    namePrefix: v.optional(v.string()),
    region: v.optional(v.string()),
    model: v.optional(v.string()),
    squadId: v.optional(v.id("squads")),
    reportsTo: v.optional(v.id("agents")),
    // BYOK: caller's own API key for the target model provider. Passed through
    // to the spawned container as a runtime secret; NEVER persisted on the
    // agents row (raw secrets live in convex/secrets.ts, not here).
    modelApiKey: v.optional(v.string()),
    // Harness-agnostic runtime (features 1,3,5).
    harness: v.optional(v.string()),
    imageRef: v.optional(v.string()),
    // argv template for CLI-shaped harnesses (-> HERMES_AGENT_COMMAND). See
    // docs/HARNESS_SPEC.md "generic-cli requires agentCommand".
    agentCommand: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ cloudflare: boolean; deployed: { agentId: string; name: string; token: string }[] }> => {
    const n = Math.max(1, Math.min(args.count, 25)); // safety cap
    const cap = await ctx.runQuery(internal.fleet.checkHostedCapacity, {
      spaceId: args.spaceId,
      requested: n,
    });

    if (args.harness && args.harness !== "hermes" && !isKnownHarness(args.harness)) {
      throw new Error(
        `Unknown harness ${JSON.stringify(args.harness)}; supported: ${KNOWN_HARNESS_IDS.join(", ")}`,
      );
    }
    // BYO container image is an enterprise entitlement — gate it here (the
    // fleet worker trusts this call and does not re-check plan itself).
    if (args.imageRef && cap.plan !== "enterprise") {
      throw new Error("Bringing your own container image requires the enterprise plan");
    }
    // generic-cli's adapter (connector/control_plane/frameworks.py's
    // CliExecutor) fails fast at container boot if HERMES_AGENT_COMMAND is
    // unset — catch that here instead of letting every container in the
    // batch spawn and immediately crash-loop. Not required for imageRef/BYO
    // deploys (the image is opaque to us) or other harnesses (they ship a
    // working default command, agentCommand only overrides it there).
    const agentCommand = args.agentCommand?.trim() || undefined;
    if (!args.imageRef && (args.harness ?? "hermes") === "generic-cli" && !agentCommand) {
      throw new Error(
        "The generic-cli harness requires agentCommand (the CLI invocation to run per instruction, e.g. \"my-agent --task '{instruction}'\")",
      );
    }

    const configured = cloudflareConfigured();
    const prefix = (args.namePrefix ?? "Agent").trim() || "Agent";
    const deployed: { agentId: string; name: string; token: string }[] = [];

    for (let i = 0; i < n; i++) {
      const name = n === 1 ? prefix : `${prefix} ${i + 1}`;
      const token = generateToken();
      const tokenHash = await sha256Hex(token);
      let vmId: string | undefined;
      let status: "provisioning" | "running" | "failed" = "provisioning";
      let resolvedHarness = args.imageRef ? "custom" : args.harness ?? "hermes";
      let harnessVersion: string | undefined;

      if (configured) {
        try {
          const res = await spawnAgent({
            token,
            controlPlaneUrl: controlPlaneUrl(),
            region: args.region,
            model: args.model,
            name,
            modelApiKey: args.modelApiKey,
            harness: args.harness,
            imageRef: args.imageRef,
            agentCommand,
          });
          vmId = res.vmId;
          resolvedHarness = res.harness;
          harnessVersion = res.harnessVersion ?? undefined;
          status = "running";
        } catch {
          status = "failed";
        }
      }

      const agentId: string = await ctx.runMutation(internal.fleet.insertFleetAgent, {
        spaceId: args.spaceId,
        name,
        tokenHash,
        vmProvider: "cloudflare",
        vmId,
        region: args.region,
        model: args.model,
        squadId: args.squadId,
        reportsTo: args.reportsTo,
        deploymentStatus: status,
        harness: resolvedHarness,
        harnessVersion,
        imageRef: args.imageRef,
      });
      deployed.push({ agentId, name, token });
    }

    return { cloudflare: configured, deployed };
  },
});

export const prepareTerminate = internalMutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");
    return { vmId: agent.vmId ?? null };
  },
});

export const markStopped = internalMutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return;
    await ctx.db.patch(agentId, {
      deploymentStatus: "stopped",
      status: "offline",
    });
  },
});

export const terminate = action({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }): Promise<void> => {
    const { vmId } = await ctx.runMutation(internal.fleet.prepareTerminate, {
      spaceId,
      agentId,
    });
    if (vmId && cloudflareConfigured()) {
      try {
        await terminateAgent(vmId);
      } catch {
        // best-effort; still mark stopped
      }
    }
    await ctx.runMutation(internal.fleet.markStopped, { spaceId, agentId });
  },
});

/** Fleet agents in the Space that have a Cloudflare VM id to poll. */
export const listWithVmId = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return agents
      .filter((a) => a.vmId)
      .map((a) => ({ agentId: a._id, vmId: a.vmId as string }));
  },
});

/** Apply a polled Cloudflare status onto an agent's deploymentStatus. */
export const applyDeploymentStatus = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    deploymentStatus: v.union(v.literal("running"), v.literal("stopped")),
  },
  handler: async (ctx, { spaceId, agentId, deploymentStatus }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return;
    await ctx.db.patch(agentId, {
      deploymentStatus,
      status: deploymentStatus === "running" ? "online" : "offline",
    });
  },
});

/**
 * Poll Cloudflare for each fleet agent's live VM status and reconcile
 * deploymentStatus. Degrades gracefully when Cloudflare isn't configured (just
 * returns the current fleet list) and best-effort skips any agent whose
 * status call fails.
 */
export const refreshStatus = action({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }): Promise<Doc<"agents">[]> => {
    await ctx.runQuery(internal.fleet.assertOperator, { spaceId });

    if (cloudflareConfigured()) {
      const agents = await ctx.runQuery(internal.fleet.listWithVmId, { spaceId });
      for (const { agentId, vmId } of agents) {
        try {
          const raw = await agentStatus(vmId);
          const mapped: "running" | "stopped" | null =
            raw === "running" ? "running" : raw === "stopped" ? "stopped" : null;
          if (mapped) {
            await ctx.runMutation(internal.fleet.applyDeploymentStatus, {
              spaceId,
              agentId,
              deploymentStatus: mapped,
            });
          }
        } catch {
          // best-effort; leave that agent's status as-is
        }
      }
    }

    return await ctx.runQuery(api.fleet.list, { spaceId });
  },
});

/**
 * Fleet agents eligible for a rolling restart (feature 5): Cloudflare-hosted,
 * currently running, optionally filtered to one harness. Each candidate is
 * flagged `draining: true` when it has a `runSteps` row still `"running"` —
 * those are skipped for this pass so an in-flight task is never killed
 * mid-execution; a later pass (or manual re-run) picks them up once they
 * finish.
 */
export const eligibleForRestart = internalQuery({
  args: { spaceId: v.id("spaces"), harness: v.optional(v.string()) },
  handler: async (ctx, { spaceId, harness }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const candidates = agents.filter(
      (a) =>
        a.vmProvider === "cloudflare" &&
        !!a.vmId &&
        a.deploymentStatus === "running" &&
        (!harness || (a.harness ?? "hermes") === harness),
    );
    const out: { agentId: Id<"agents">; vmId: string; name: string; draining: boolean }[] = [];
    for (const a of candidates) {
      const running = await ctx.db
        .query("runSteps")
        .withIndex("by_agent_status", (q) => q.eq("agentId", a._id).eq("status", "running"))
        .first();
      out.push({ agentId: a._id, vmId: a.vmId as string, name: a.name, draining: !!running });
    }
    return out;
  },
});

/**
 * Public read for a rolling-restart status panel: every agent in the Space
 * currently flagged `restartRequestedAt` (queued by `rollingRestart`, either
 * already restarted-and-cleared or still waiting on `sweepPendingRestarts` to
 * pick it up), plus whether it's still draining right now. Operator-gated
 * like the mutating actions in this section.
 */
export const pendingRestarts = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const pending = agents.filter((a) => a.restartRequestedAt !== undefined);
    const out: {
      agentId: Id<"agents">;
      name: string;
      harness: string;
      restartRequestedAt: number;
      draining: boolean;
    }[] = [];
    for (const a of pending) {
      const running = await ctx.db
        .query("runSteps")
        .withIndex("by_agent_status", (q) => q.eq("agentId", a._id).eq("status", "running"))
        .first();
      out.push({
        agentId: a._id,
        name: a.name,
        harness: a.harness ?? "hermes",
        restartRequestedAt: a.restartRequestedAt as number,
        draining: !!running,
      });
    }
    return out;
  },
});

/** Clear restartRequestedAt + record the restart on the agent (best-effort audit). */
export const markRestarted = internalMutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }) => {
    const scope = await resolveScope(ctx, spaceId);
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return;
    await ctx.db.patch(agentId, {
      restartRequestedAt: undefined,
      lastRestartAt: Date.now(),
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "agent",
      action: "fleet_restarted",
      summary: `Rolling-restarted ${agent.name}`,
    });
  },
});

/** Mark drained agents as having a restart pending, so a future sweep can retry them. */
export const markRestartPending = internalMutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return;
    await ctx.db.patch(agentId, { restartRequestedAt: Date.now() });
  },
});

/**
 * Rolling restart (feature 5): reboot every running Cloudflare-hosted agent
 * in the Space in place (same vmId, same connector token) so it picks up a
 * newer harness/connector image once one is deployed for its class — with
 * draining: any agent whose runSteps has one `status: "running"` is skipped
 * this pass (flagged `restartRequestedAt` so a later call/sweep retries it)
 * rather than killed mid-task. Optionally scoped to one `harness`.
 */
export const rollingRestart = action({
  args: { spaceId: v.id("spaces"), harness: v.optional(v.string()) },
  handler: async (
    ctx,
    { spaceId, harness },
  ): Promise<{ restarted: string[]; drained: string[]; failed: string[]; total: number }> => {
    const candidates = await ctx.runQuery(internal.fleet.eligibleForRestart, { spaceId, harness });
    const restarted: string[] = [];
    const drained: string[] = [];
    const failed: string[] = [];
    const configured = cloudflareConfigured();

    for (const c of candidates) {
      // Draining takes priority regardless of provider config: an in-flight
      // task is never counted as "restarted" just because there was nothing
      // to actually call.
      if (c.draining) {
        drained.push(c.agentId);
        await ctx.runMutation(internal.fleet.markRestartPending, { spaceId, agentId: c.agentId });
        continue;
      }
      if (!configured) {
        // Nothing hosted to actually restart (e.g. agents provisioned before
        // Cloudflare was wired up) — not draining, not attempted, not failed.
        continue;
      }
      try {
        await restartAgent(c.vmId);
        await ctx.runMutation(internal.fleet.markRestarted, { spaceId, agentId: c.agentId });
        restarted.push(c.agentId);
      } catch {
        failed.push(c.agentId);
      }
    }

    return { restarted, drained, failed, total: candidates.length };
  },
});

// ---------------------------------------------------------------------------
// Automatic drain-requeue sweep (feature 5 completion): `rollingRestart`
// flags an agent with `restartRequestedAt` when it's drained (has a running
// runStep) instead of restarting it immediately. Without something retrying
// those later, an operator would have to remember to re-call rollingRestart
// by hand once the in-flight task finishes. This sweep does that
// automatically — intended to run on a cron (see docs/HARNESS_SPEC.md; cron
// registration is requested from the integrator since crons.ts is shared).
// It is system-triggered (no end-user identity), so it does NOT go through
// resolveScope/requireRole like the user-facing actions above — it only
// retries a restart that a real operator already authorized via
// `rollingRestart`, it never initiates a new one.
// ---------------------------------------------------------------------------

/** Bounded scan across all Spaces — same pattern as costs.sweepIdleHibernation. */
export const listSpacesForRestartSweep = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("spaces").take(5000);
  },
});

/**
 * Agents in this Space with a pending restart request, whether or not they're
 * still draining. System query (no resolveScope) — only reads what
 * `rollingRestart` already wrote.
 */
export const pendingRestartCandidates = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const pending = agents.filter(
      (a) => a.restartRequestedAt !== undefined && a.vmProvider === "cloudflare" && !!a.vmId,
    );
    const out: { agentId: Id<"agents">; vmId: string; name: string; draining: boolean }[] = [];
    for (const a of pending) {
      const running = await ctx.db
        .query("runSteps")
        .withIndex("by_agent_status", (q) => q.eq("agentId", a._id).eq("status", "running"))
        .first();
      out.push({ agentId: a._id, vmId: a.vmId as string, name: a.name, draining: !!running });
    }
    return out;
  },
});

/**
 * Retry every drained-and-now-idle agent's pending restart, Space by Space.
 * Still-draining agents are left alone (their `restartRequestedAt` stays set
 * for the next sweep). Cloudflare-unconfigured deploys have no `vmId` and
 * never match `pendingRestartCandidates`, so this is a safe no-op for them.
 */
export const sweepPendingRestarts = internalAction({
  args: {},
  handler: async (ctx): Promise<{ restarted: number; stillDraining: number; failed: number }> => {
    const spaces: Doc<"spaces">[] = await ctx.runQuery(internal.fleet.listSpacesForRestartSweep, {});
    let restarted = 0;
    let stillDraining = 0;
    let failed = 0;
    const configured = cloudflareConfigured();

    for (const space of spaces) {
      const candidates = await ctx.runQuery(internal.fleet.pendingRestartCandidates, {
        spaceId: space._id,
      });
      for (const c of candidates) {
        if (c.draining) {
          stillDraining++;
          continue;
        }
        if (!configured) continue;
        try {
          await restartAgent(c.vmId);
          await ctx.runMutation(internal.fleet.markRestartedSystem, {
            spaceId: space._id,
            agentId: c.agentId,
          });
          restarted++;
        } catch {
          failed++;
        }
      }
    }

    return { restarted, stillDraining, failed };
  },
});

/** System variant of markRestarted (no resolveScope — the sweep has no user identity). */
export const markRestartedSystem = internalMutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return;
    await ctx.db.patch(agentId, {
      restartRequestedAt: undefined,
      lastRestartAt: Date.now(),
    });
    await recordWorkEvent(ctx, {
      companyId: agent.companyId,
      spaceId,
      actorType: "system",
      agentId,
      category: "agent",
      action: "fleet_restarted",
      summary: `Rolling-restarted ${agent.name} (drain sweep)`,
    });
  },
});
