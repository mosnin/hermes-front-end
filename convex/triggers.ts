import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveScope, requireRole } from "./lib/auth";

/**
 * Parse a simple, dependency-free schedule spec into the next run time.
 * Supports: "every Nm" | "every Nh" | "every Nd" | "hourly" | "daily".
 */
export function nextRunFrom(spec: string, from: number): number {
  const s = spec.trim().toLowerCase();
  const m = s.match(/^every\s+(\d+)\s*([mhd])$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]]!;
    return from + n * unit;
  }
  if (s === "hourly") return from + 3_600_000;
  if (s === "daily") return from + 86_400_000;
  // Fallback: hourly.
  return from + 3_600_000;
}

export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("triggers")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
  },
});

export const create = mutation({
  args: {
    spaceId: v.id("spaces"),
    workflowId: v.id("workflows"),
    kind: v.union(
      v.literal("schedule"),
      v.literal("webhook"),
      v.literal("event"),
    ),
    cron: v.optional(v.string()),
    eventType: v.optional(v.string()),
  },
  handler: async (ctx, { spaceId, workflowId, kind, cron, eventType }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const wf = await ctx.db.get(workflowId);
    if (!wf || wf.spaceId !== spaceId) throw new Error("Workflow not found");
    const now = Date.now();
    return await ctx.db.insert("triggers", {
      companyId: scope.companyId,
      spaceId,
      workflowId,
      kind,
      cron,
      nextRunAt: kind === "schedule" && cron ? nextRunFrom(cron, now) : undefined,
      webhookSecret:
        kind === "webhook" ? crypto.randomUUID().replace(/-/g, "") : undefined,
      eventType,
      enabled: true,
      createdAt: now,
    });
  },
});

export const setEnabled = mutation({
  args: {
    spaceId: v.id("spaces"),
    triggerId: v.id("triggers"),
    enabled: v.boolean(),
  },
  handler: async (ctx, { spaceId, triggerId, enabled }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const t = await ctx.db.get(triggerId);
    if (!t || t.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(triggerId, {
      enabled,
      nextRunAt:
        enabled && t.kind === "schedule" && t.cron
          ? nextRunFrom(t.cron, Date.now())
          : t.nextRunAt,
    });
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), triggerId: v.id("triggers") },
  handler: async (ctx, { spaceId, triggerId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const t = await ctx.db.get(triggerId);
    if (!t || t.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(triggerId);
  },
});

// --- scheduler + webhook internals ------------------------------------------

/** Cron tick (every minute): fire any due schedule triggers and reschedule. */
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const enabled = await ctx.db
      .query("triggers")
      .withIndex("by_due", (q) => q.eq("enabled", true))
      .collect();
    for (const t of enabled) {
      if (t.kind !== "schedule" || t.nextRunAt == null || t.nextRunAt > now) {
        continue;
      }
      await ctx.scheduler.runAfter(0, internal.workflows.startFromTrigger, {
        workflowId: t.workflowId,
        trigger: "schedule",
      });
      await ctx.db.patch(t._id, {
        nextRunAt: nextRunFrom(t.cron ?? "hourly", now),
      });
    }
  },
});

export const getForWebhook = internalQuery({
  args: { triggerId: v.id("triggers") },
  handler: async (ctx, { triggerId }) => {
    return await ctx.db.get(triggerId);
  },
});
