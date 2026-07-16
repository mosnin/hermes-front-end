import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";

/** The action ledger for a Space — every action agents take or propose, newest first. */
export const list = query({
  args: { spaceId: v.id("spaces"), status: v.optional(v.string()) },
  handler: async (ctx, { spaceId, status }) => {
    await resolveScope(ctx, spaceId);
    if (status) {
      return await ctx.db
        .query("actionLedger")
        .withIndex("by_space_status", (q) =>
          q.eq("spaceId", spaceId).eq("status", status as never),
        )
        .order("desc")
        .take(300);
    }
    return await ctx.db
      .query("actionLedger")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(300);
  },
});

/** Append an action to the ledger. Used by the execution engine. */
export const record = internalMutation({
  args: {
    companyId: v.string(),
    spaceId: v.id("spaces"),
    agentId: v.optional(v.id("agents")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    action: v.string(),
    target: v.optional(v.string()),
    status: v.union(
      v.literal("proposed"),
      v.literal("executed"),
      v.literal("reverted"),
      v.literal("blocked"),
    ),
    reversible: v.optional(v.boolean()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("actionLedger", {
      companyId: args.companyId,
      spaceId: args.spaceId,
      agentId: args.agentId,
      workflowRunId: args.workflowRunId,
      action: args.action,
      target: args.target,
      status: args.status,
      reversible: args.reversible,
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});

/** Roll back an executed, reversible action (admin+). */
export const revert = mutation({
  args: { spaceId: v.id("spaces"), entryId: v.id("actionLedger") },
  handler: async (ctx, { spaceId, entryId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const entry = await ctx.db.get(entryId);
    if (!entry || entry.spaceId !== spaceId) throw new Error("Not found");
    if (entry.status !== "executed" || !entry.reversible) {
      throw new Error("Only executed, reversible actions can be reverted");
    }
    await ctx.db.patch(entryId, {
      status: "reverted",
      decidedAt: Date.now(),
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId: entry.agentId,
      workflowRunId: entry.workflowRunId,
      category: "governance",
      action: "action_reverted",
      summary: `Reverted action: ${entry.action}${entry.target ? ` → ${entry.target}` : ""}`,
    });
  },
});

/** Counts of ledger entries by status for a Space. */
export const stats = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("actionLedger")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const counts = { proposed: 0, executed: 0, reverted: 0, blocked: 0 };
    for (const r of rows) {
      if (r.status in counts) counts[r.status as keyof typeof counts] += 1;
    }
    return counts;
  },
});
