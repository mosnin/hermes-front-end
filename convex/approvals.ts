import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent, recordNotification } from "./lib/events";

/** List approval requests for a Space, newest first; optionally filtered by status. */
export const list = query({
  args: { spaceId: v.id("spaces"), status: v.optional(v.string()) },
  handler: async (ctx, { spaceId, status }) => {
    await resolveScope(ctx, spaceId);
    if (status) {
      return await ctx.db
        .query("approvals")
        .withIndex("by_space_status", (q) =>
          q.eq("spaceId", spaceId).eq("status", status as never),
        )
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("approvals")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
  },
});

/** Count of pending approvals awaiting a decision in this Space. */
export const pendingCount = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("approvals")
      .withIndex("by_space_status", (q) =>
        q.eq("spaceId", spaceId).eq("status", "pending"),
      )
      .collect();
    return rows.length;
  },
});

/** Open a human-in-the-loop approval gate (operator+). */
export const request = mutation({
  args: {
    spaceId: v.id("spaces"),
    kind: v.string(),
    title: v.string(),
    detail: v.optional(v.string()),
    agentId: v.optional(v.id("agents")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, { spaceId, ...args }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const approvalId = await ctx.db.insert("approvals", {
      companyId: scope.companyId,
      spaceId,
      kind: args.kind,
      title: args.title,
      detail: args.detail,
      agentId: args.agentId,
      workflowRunId: args.workflowRunId,
      payload: args.payload,
      status: "pending",
      requestedBy: scope.userId,
      createdAt: Date.now(),
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId: args.agentId,
      workflowRunId: args.workflowRunId,
      category: "governance",
      action: "approval_requested",
      summary: args.title,
    });
    await recordNotification(ctx, {
      companyId: scope.companyId,
      spaceId,
      type: "approval",
      title: `Approval needed: ${args.title}`,
      body: args.detail,
      href: "/dashboard/approvals",
    });
    return approvalId;
  },
});

/** Approve or reject a pending gate (admin+). */
export const decide = mutation({
  args: {
    spaceId: v.id("spaces"),
    approvalId: v.id("approvals"),
    approve: v.boolean(),
  },
  handler: async (ctx, { spaceId, approvalId, approve }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const approval = await ctx.db.get(approvalId);
    if (!approval || approval.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(approvalId, {
      status: approve ? "approved" : "rejected",
      decidedBy: scope.userId,
      decidedAt: Date.now(),
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId: approval.agentId,
      workflowRunId: approval.workflowRunId,
      category: "governance",
      action: approve ? "approval_granted" : "approval_rejected",
      summary: `${approve ? "Approved" : "Rejected"}: ${approval.title}`,
    });

    // If this approval gated a workflow run, release or kill it now.
    if (approval.workflowRunId) {
      const run = await ctx.db.get(approval.workflowRunId);
      if (run && run.status === "awaiting_approval") {
        if (approve) {
          await ctx.db.patch(run._id, { status: "running" });
          await ctx.scheduler.runAfter(0, internal.engine.advanceRun, {
            runId: run._id,
          });
        } else {
          await ctx.db.patch(run._id, {
            status: "killed",
            finishedAt: Date.now(),
          });
        }
      }
    }
  },
});
