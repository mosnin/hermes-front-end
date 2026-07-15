import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordNotification, recordWorkEvent } from "./lib/events";
import { monthBucket, readCounterQuery } from "./lib/counters";

/** Human-readable catalog of alertable metrics (drives the UI + evaluation). */
export const METRICS: Record<
  string,
  { label: string; unit: string; help: string }
> = {
  errors_24h: { label: "Errors (24h)", unit: "count", help: "Structured errors captured in the last 24h" },
  budget_pct: { label: "Budget used", unit: "%", help: "Percent of the monthly budget spent" },
  agents_offline: { label: "Agents offline", unit: "count", help: "Agents not currently reporting" },
  run_success_rate: { label: "Run success rate", unit: "%", help: "Completed / finished runs (recent)" },
  dead_letters_open: { label: "Open dead-letters", unit: "count", help: "Unresolved terminal failures" },
  a2a_rate: { label: "A2A this minute", unit: "count", help: "Agent-to-agent messages in the current minute" },
};

// -- CRUD ---------------------------------------------------------------------

export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("alertRules")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    metric: v.string(),
    comparator: v.union(v.literal("gt"), v.literal("lt")),
    threshold: v.number(),
    channel: v.string(),
    bridgeId: v.optional(v.id("bridges")),
    cooldownMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveScope(ctx, args.spaceId);
    requireRole(scope, "operator");
    if (!METRICS[args.metric]) throw new Error("Unknown metric");
    return await ctx.db.insert("alertRules", {
      companyId: scope.companyId,
      spaceId: args.spaceId,
      name: args.name,
      metric: args.metric,
      comparator: args.comparator,
      threshold: args.threshold,
      channel: args.channel,
      bridgeId: args.bridgeId,
      enabled: true,
      cooldownMinutes: args.cooldownMinutes ?? 30,
      createdBy: scope.userId,
      createdAt: Date.now(),
    });
  },
});

export const toggle = mutation({
  args: { spaceId: v.id("spaces"), ruleId: v.id("alertRules"), enabled: v.boolean() },
  handler: async (ctx, { spaceId, ruleId, enabled }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const rule = await ctx.db.get(ruleId);
    if (!rule || rule.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(ruleId, { enabled });
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), ruleId: v.id("alertRules") },
  handler: async (ctx, { spaceId, ruleId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const rule = await ctx.db.get(ruleId);
    if (!rule || rule.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(ruleId);
  },
});

// -- Evaluation ---------------------------------------------------------------

/** Compute a single metric's current value for a Space (bounded reads). */
async function metricValue(
  ctx: QueryCtx | MutationCtx,
  space: Doc<"spaces">,
  metric: string,
): Promise<number | null> {
  const spaceId = space._id;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  switch (metric) {
    case "errors_24h": {
      const rows = await ctx.db
        .query("errors")
        .withIndex("by_space_time", (q) =>
          q.eq("spaceId", spaceId).gte("createdAt", dayAgo),
        )
        .take(1001);
      return rows.length;
    }
    case "budget_pct": {
      const budget = space.guardConfig?.monthlyBudgetUsd ?? 0;
      if (budget <= 0) return null; // no budget → not alertable
      const c = await readCounterQuery(ctx, spaceId, "usage", monthBucket());
      return (c.valueUsd / budget) * 100;
    }
    case "agents_offline": {
      const agents = await ctx.db
        .query("agents")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .take(1000);
      return agents.filter((a) => a.status !== "online" && a.kind !== "a2a-external").length;
    }
    case "run_success_rate": {
      const runs = await ctx.db
        .query("workflowRuns")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .order("desc")
        .take(50);
      const finished = runs.filter((r) => r.status === "completed" || r.status === "failed");
      if (finished.length === 0) return null;
      const ok = finished.filter((r) => r.status === "completed").length;
      return (ok / finished.length) * 100;
    }
    case "dead_letters_open": {
      const rows = await ctx.db
        .query("deadLetters")
        .withIndex("by_space_status", (q) =>
          q.eq("spaceId", spaceId).eq("status", "open"),
        )
        .take(500);
      return rows.length;
    }
    case "a2a_rate": {
      const c = await readCounterQuery(ctx, spaceId, "a2a:min", String(Math.floor(Date.now() / 60000)));
      return c.count;
    }
    default:
      return null;
  }
}

function breached(comparator: "gt" | "lt", value: number, threshold: number): boolean {
  return comparator === "gt" ? value > threshold : value < threshold;
}

/** Fire a rule: notify + optionally send to a bridge; stamp lastFired. */
async function fire(
  ctx: MutationCtx,
  rule: Doc<"alertRules">,
  value: number,
): Promise<void> {
  const meta = METRICS[rule.metric];
  const dir = rule.comparator === "gt" ? ">" : "<";
  const body = `${meta?.label ?? rule.metric} is ${value.toFixed(rule.metric.endsWith("_rate") || rule.metric === "budget_pct" ? 1 : 0)}${meta?.unit === "%" ? "%" : ""} (${dir} ${rule.threshold})`;
  await ctx.db.patch(rule._id, { lastFiredAt: Date.now(), lastValue: value });
  await recordNotification(ctx, {
    companyId: rule.companyId,
    spaceId: rule.spaceId,
    type: "alert",
    title: `Alert: ${rule.name}`,
    body,
    href: "/dashboard/alerts",
  });
  await recordWorkEvent(ctx, {
    companyId: rule.companyId,
    spaceId: rule.spaceId,
    actorType: "system",
    category: "governance",
    action: "alert_fired",
    summary: `${rule.name} — ${body}`,
  });
  if (rule.channel === "bridge" && rule.bridgeId) {
    await ctx.scheduler.runAfter(0, internal.bridges.sendOutbound, {
      bridgeId: rule.bridgeId,
      text: `🚨 ${rule.name}: ${body}`,
    });
  }
}

/**
 * Evaluate every enabled alert rule. Cron-driven (every few minutes). Groups
 * rules by Space so each Space's docs are loaded once, and respects each rule's
 * cooldown so a sustained breach pages once per window, not every tick.
 */
export const evaluateAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rules = await ctx.db
      .query("alertRules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .take(1000);
    const now = Date.now();
    const spaceCache = new Map<string, Doc<"spaces"> | null>();
    let fired = 0;
    for (const rule of rules) {
      // Cooldown gate.
      if (rule.lastFiredAt && now - rule.lastFiredAt < rule.cooldownMinutes * 60_000) {
        continue;
      }
      let space = spaceCache.get(rule.spaceId);
      if (space === undefined) {
        space = await ctx.db.get(rule.spaceId);
        spaceCache.set(rule.spaceId, space);
      }
      if (!space) continue;
      const value = await metricValue(ctx, space, rule.metric);
      if (value === null) continue;
      if (breached(rule.comparator, value, rule.threshold)) {
        await fire(ctx, rule, value);
        fired++;
      } else if (rule.lastValue !== value) {
        await ctx.db.patch(rule._id, { lastValue: value });
      }
    }
    return { evaluated: rules.length, fired };
  },
});

/** Manual "test this rule now" — evaluate + fire regardless of cooldown. */
export const testFire = mutation({
  args: { spaceId: v.id("spaces"), ruleId: v.id("alertRules") },
  handler: async (ctx, { spaceId, ruleId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const rule = await ctx.db.get(ruleId);
    if (!rule || rule.spaceId !== spaceId) throw new Error("Not found");
    const value = (await metricValue(ctx, scope.space, rule.metric)) ?? 0;
    await fire(ctx, rule, value);
    return { value };
  },
});
