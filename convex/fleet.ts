import { v } from "convex/values";
import {
  query,
  action,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";
import { generateToken, sha256Hex } from "./lib/crypto";
import {
  cloudflareConfigured,
  spawnAgent,
  terminateAgent,
} from "./lib/cloudflare";

/** The control-plane URL deployed agents connect back to (Convex HTTP actions). */
function controlPlaneUrl(): string {
  return process.env.CONVEX_SITE_URL ?? "";
}

export const providerStatus = query({
  args: {},
  handler: async () => ({ cloudflare: cloudflareConfigured() }),
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
      summary: `Deployed ${rest.name} on ${rest.vmProvider}`,
    });
    return agentId;
  },
});

/**
 * One-click deploy: provision N agents onto Cloudflare and slot them into the
 * Space/Squad/hierarchy. If Cloudflare isn't configured, the agents are still
 * created (status "provisioning") and their one-time tokens returned so they
 * can be connected by hand.
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
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ cloudflare: boolean; deployed: { agentId: string; name: string; token: string }[] }> => {
    await ctx.runQuery(internal.fleet.assertOperator, { spaceId: args.spaceId });
    const configured = cloudflareConfigured();
    const n = Math.max(1, Math.min(args.count, 25)); // safety cap
    const prefix = (args.namePrefix ?? "Agent").trim() || "Agent";
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
            model: args.model,
            name,
          });
          vmId = res.vmId;
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
