import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent, recordActivity } from "./lib/events";

/**
 * Campaigns are ONGOING jobs: a standing objective an agent pursues on a
 * cadence (e.g. outreach — find contacts, send, follow up, book demos), as
 * opposed to one-off tasks. Each `tick` advances the schedule and logs a run.
 */

/**
 * Parse a simple, dependency-free cadence into milliseconds.
 * Supports: "every Nm" | "every Nh" | "every Nd" | "hourly" | "daily".
 * Mirrors triggers.nextRunFrom but returns the interval (not an absolute time).
 */
function cadenceMs(spec: string): number {
  const s = spec.trim().toLowerCase();
  const m = s.match(/^every\s+(\d+)\s*([mhd])$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]]!;
    return n * unit;
  }
  if (s === "hourly") return 3_600_000;
  if (s === "daily") return 86_400_000;
  // Fallback: hourly.
  return 3_600_000;
}

export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("campaigns")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    objective: v.string(),
    agentId: v.optional(v.id("agents")),
    cadence: v.optional(v.string()),
  },
  handler: async (ctx, { spaceId, name, objective, agentId, cadence }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    if (agentId) {
      const agent = await ctx.db.get(agentId);
      if (!agent || agent.spaceId !== spaceId) throw new Error("Agent not found");
    }
    const now = Date.now();
    const campaignId = await ctx.db.insert("campaigns", {
      companyId: scope.companyId,
      spaceId,
      name,
      objective,
      status: "active",
      agentId,
      cadence,
      nextRunAt: cadence ? now + cadenceMs(cadence) : undefined,
      metrics: { contacted: 0, replied: 0, booked: 0 },
      createdAt: now,
      updatedAt: now,
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "campaign",
      action: "campaign_created",
      summary: `Created campaign "${name}"`,
      payload: { campaignId, objective, cadence },
    });
    return campaignId;
  },
});

export const setStatus = mutation({
  args: {
    spaceId: v.id("spaces"),
    campaignId: v.id("campaigns"),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
    ),
  },
  handler: async (ctx, { spaceId, campaignId, status }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const c = await ctx.db.get(campaignId);
    if (!c || c.spaceId !== spaceId) throw new Error("Campaign not found");
    const now = Date.now();
    // Re-activating a cadenced campaign reschedules its next run from now.
    const nextRunAt =
      status === "active" && c.cadence
        ? now + cadenceMs(c.cadence)
        : status === "active"
          ? c.nextRunAt
          : undefined;
    await ctx.db.patch(campaignId, { status, nextRunAt, updatedAt: now });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId: c.agentId,
      category: "campaign",
      action: "campaign_status",
      summary: `Campaign "${c.name}" → ${status}`,
    });
  },
});

export const bumpMetric = mutation({
  args: {
    spaceId: v.id("spaces"),
    campaignId: v.id("campaigns"),
    key: v.string(),
    by: v.optional(v.number()),
  },
  handler: async (ctx, { spaceId, campaignId, key, by }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const c = await ctx.db.get(campaignId);
    if (!c || c.spaceId !== spaceId) throw new Error("Campaign not found");
    const metrics = { ...(c.metrics ?? {}) } as Record<string, number>;
    metrics[key] = (metrics[key] ?? 0) + (by ?? 1);
    await ctx.db.patch(campaignId, { metrics, updatedAt: Date.now() });
    return metrics[key];
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), campaignId: v.id("campaigns") },
  handler: async (ctx, { spaceId, campaignId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const c = await ctx.db.get(campaignId);
    if (!c || c.spaceId !== spaceId) throw new Error("Campaign not found");
    await ctx.db.delete(campaignId);
  },
});

/**
 * Cron tick (the orchestrator wires a 1-min cron entry to
 * internal.campaigns.tick). Processes all currently-due active campaigns in a
 * single pass: logs a run and advances nextRunAt by the cadence.
 *
 * NOTE: this keeps the loop real but minimal — it records the run and reschedules.
 * The deeper step is wiring each campaign's objective into a dispatched
 * workflow/A2A task to the assigned agent (e.g. internal.a2a.routeFromConnector
 * or internal.workflows.startFromTrigger), so the agent actually executes the
 * outreach work and reports metrics back via bumpMetric.
 */
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // by_due is ["status","nextRunAt"] — range to only the campaigns due now.
    const due = await ctx.db
      .query("campaigns")
      .withIndex("by_due", (q) =>
        q.eq("status", "active").lte("nextRunAt", now),
      )
      .take(100);
    for (const c of due) {
      // Campaigns with no cadence have nextRunAt undefined; the index range
      // above can surface them, so skip anything not actually scheduled.
      if (c.nextRunAt == null) continue;
      await recordWorkEvent(ctx, {
        companyId: c.companyId,
        spaceId: c.spaceId,
        actorType: "system",
        agentId: c.agentId,
        category: "campaign",
        action: "campaign_run",
        summary: `Ran campaign "${c.name}"`,
        payload: { campaignId: c._id, objective: c.objective },
      });
      await recordActivity(ctx, {
        companyId: c.companyId,
        spaceId: c.spaceId,
        agentId: c.agentId,
        type: "campaign_run",
        title: `Campaign run: ${c.name}`,
        detail: c.objective.slice(0, 140),
        payload: { campaignId: c._id },
      });
      await ctx.db.patch(c._id, {
        nextRunAt: now + cadenceMs(c.cadence ?? "hourly"),
        updatedAt: now,
      });
    }
  },
});
