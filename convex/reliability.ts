import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";

/** List dead-letter entries for a Space (open first, newest first). */
export const listDeadLetters = query({
  args: {
    spaceId: v.id("spaces"),
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("replayed"),
        v.literal("dismissed"),
      ),
    ),
  },
  handler: async (ctx, { spaceId, status }) => {
    await resolveScope(ctx, spaceId);
    if (status) {
      return await ctx.db
        .query("deadLetters")
        .withIndex("by_space_status", (q) =>
          q.eq("spaceId", spaceId).eq("status", status),
        )
        .order("desc")
        .take(100);
    }
    return await ctx.db
      .query("deadLetters")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(100);
  },
});

/** Count of open dead-letters (for an Ops badge). */
export const openCount = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const open = await ctx.db
      .query("deadLetters")
      .withIndex("by_space_status", (q) =>
        q.eq("spaceId", spaceId).eq("status", "open"),
      )
      .take(101);
    return open.length > 100 ? "100+" : String(open.length);
  },
});

/**
 * Replay a dead-lettered failure by starting a fresh run of its workflow.
 * Marks the entry replayed so it doesn't reappear. Requires operator role.
 */
export const replayDeadLetter = mutation({
  args: { spaceId: v.id("spaces"), deadLetterId: v.id("deadLetters") },
  // Explicit return type breaks the self-referential inference through
  // `internal.workflows.startFromTrigger` (TS7022/7023) that would otherwise
  // resolve this module's type to `any` and poison the aggregated api types.
  handler: async (ctx, { spaceId, deadLetterId }): Promise<Id<"workflowRuns"> | null> => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const dl = await ctx.db.get(deadLetterId);
    if (!dl || dl.spaceId !== spaceId) throw new Error("Not found");
    if (dl.status !== "open") throw new Error("Already resolved");
    if (!dl.workflowId) throw new Error("No workflow to replay");

    const runId: Id<"workflowRuns"> | null = await ctx.runMutation(
      internal.workflows.startFromTrigger,
      { workflowId: dl.workflowId, trigger: "replay" },
    );
    await ctx.db.patch(deadLetterId, { status: "replayed" });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "workflow",
      action: "deadletter_replayed",
      summary: `Replayed failed run as ${runId}`,
    });
    return runId;
  },
});

/** Dismiss a dead-letter entry without replaying. */
export const dismissDeadLetter = mutation({
  args: { spaceId: v.id("spaces"), deadLetterId: v.id("deadLetters") },
  handler: async (ctx, { spaceId, deadLetterId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const dl = await ctx.db.get(deadLetterId);
    if (!dl || dl.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(deadLetterId, { status: "dismissed" });
  },
});
