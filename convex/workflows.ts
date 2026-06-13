import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { assertAutonomyActive, assertWithinBudget, GuardViolation } from "./lib/guards";
import { recordWorkEvent, recordNotification } from "./lib/events";
import { DEFAULT_GUARD_CONFIG } from "./schema";

const STEP = v.object({
  id: v.string(),
  name: v.string(),
  agentId: v.optional(v.id("agents")),
  requiresCapability: v.optional(v.string()),
  instruction: v.string(),
  dependsOn: v.optional(v.array(v.string())),
  maxAttempts: v.optional(v.number()),
  timeoutMs: v.optional(v.number()),
});

export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("workflows")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { spaceId: v.id("spaces"), workflowId: v.id("workflows") },
  handler: async (ctx, { spaceId, workflowId }) => {
    await resolveScope(ctx, spaceId);
    const wf = await ctx.db.get(workflowId);
    if (!wf || wf.spaceId !== spaceId) return null;
    return wf;
  },
});

export const create = mutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    steps: v.array(STEP),
    requiresApproval: v.optional(v.boolean()),
  },
  handler: async (ctx, { spaceId, name, description, steps, requiresApproval }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const now = Date.now();
    return await ctx.db.insert("workflows", {
      companyId: scope.companyId,
      spaceId,
      name,
      description,
      enabled: true,
      requiresApproval,
      steps,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    spaceId: v.id("spaces"),
    workflowId: v.id("workflows"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    steps: v.optional(v.array(STEP)),
  },
  handler: async (ctx, { spaceId, workflowId, ...patch }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const wf = await ctx.db.get(workflowId);
    if (!wf || wf.spaceId !== spaceId) throw new Error("Not found");
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, val]) => val !== undefined),
    );
    await ctx.db.patch(workflowId, { ...clean, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), workflowId: v.id("workflows") },
  handler: async (ctx, { spaceId, workflowId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const wf = await ctx.db.get(workflowId);
    if (!wf || wf.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(workflowId);
  },
});

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

/** Create a run + its steps and kick the engine. Shared by manual + triggers. */
async function createRun(
  ctx: MutationCtx,
  wf: Doc<"workflows">,
  opts: { trigger: string; autoComplete: boolean; maxConcurrent: number },
): Promise<Id<"workflowRuns">> {
  const running = (
    await ctx.db
      .query("workflowRuns")
      .withIndex("by_space_status", (q) =>
        q.eq("spaceId", wf.spaceId).eq("status", "running"),
      )
      .collect()
  ).length;
  if (running >= opts.maxConcurrent) {
    throw new GuardViolation(
      `max concurrent runs reached (${opts.maxConcurrent})`,
    );
  }
  const now = Date.now();
  // Approval-gated workflows wait in "awaiting_approval" until a human decides.
  const gated = !!wf.requiresApproval;
  const runId = await ctx.db.insert("workflowRuns", {
    companyId: wf.companyId,
    spaceId: wf.spaceId,
    workflowId: wf._id,
    status: gated ? "awaiting_approval" : "pending",
    trigger: opts.trigger,
    input: { autoComplete: opts.autoComplete },
    hops: 0,
    stepsDone: 0,
    startedAt: now,
  });
  let index = 0;
  for (const step of wf.steps) {
    await ctx.db.insert("runSteps", {
      companyId: wf.companyId,
      spaceId: wf.spaceId,
      workflowRunId: runId,
      stepId: step.id,
      index: index++,
      name: step.name,
      agentId: step.agentId,
      instruction: step.instruction,
      status: "pending",
      attempts: 0,
    });
  }
  await recordWorkEvent(ctx, {
    companyId: wf.companyId,
    spaceId: wf.spaceId,
    actorType: "workflow",
    workflowRunId: runId,
    category: "workflow",
    action: "run_started",
    summary: `Started "${wf.name}" (${opts.trigger})`,
  });
  if (gated) {
    // Open an approval gate + notify; the run dispatches only once approved.
    await ctx.db.insert("approvals", {
      companyId: wf.companyId,
      spaceId: wf.spaceId,
      workflowRunId: runId,
      kind: "workflow",
      title: `Run workflow "${wf.name}"`,
      detail: `${wf.steps.length} step(s) awaiting approval`,
      status: "pending",
      createdAt: now,
    });
    await recordNotification(ctx, {
      companyId: wf.companyId,
      spaceId: wf.spaceId,
      type: "approval",
      title: `Approval needed: run "${wf.name}"`,
      href: "/dashboard/approvals",
    });
  } else {
    await ctx.scheduler.runAfter(0, internal.engine.advanceRun, { runId });
  }
  return runId;
}

export const start = mutation({
  args: {
    spaceId: v.id("spaces"),
    workflowId: v.id("workflows"),
    autoComplete: v.optional(v.boolean()),
  },
  handler: async (ctx, { spaceId, workflowId, autoComplete }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    assertAutonomyActive(scope);
    await assertWithinBudget(ctx, scope);
    const wf = await ctx.db.get(workflowId);
    if (!wf || wf.spaceId !== spaceId) throw new Error("Not found");
    const g = scope.space.guardConfig ?? DEFAULT_GUARD_CONFIG;
    // Default: dispatch to real agents when any are online; only fall back to
    // simulation (autoComplete) when the Space has no live agents.
    let auto = autoComplete;
    if (auto === undefined) {
      const online = await ctx.db
        .query("agents")
        .withIndex("by_space_status", (q) =>
          q.eq("spaceId", spaceId).eq("status", "online"),
        )
        .first();
      auto = !online;
    }
    return await createRun(ctx, wf, {
      trigger: "manual",
      autoComplete: auto,
      maxConcurrent: g.maxConcurrentRuns,
    });
  },
});

/** Start a run from a trigger (no user identity). */
export const startFromTrigger = internalMutation({
  args: { workflowId: v.id("workflows"), trigger: v.string() },
  handler: async (ctx, { workflowId, trigger }) => {
    const wf = await ctx.db.get(workflowId);
    if (!wf || !wf.enabled) return null;
    const space = await ctx.db.get(wf.spaceId);
    if (!space || space.autonomyPaused) return null;
    const g = space.guardConfig ?? DEFAULT_GUARD_CONFIG;
    try {
      return await createRun(ctx, wf, {
        trigger,
        autoComplete: false,
        maxConcurrent: g.maxConcurrentRuns,
      });
    } catch (e) {
      if (e instanceof GuardViolation) return null;
      throw e;
    }
  },
});

export const cancelRun = mutation({
  args: { spaceId: v.id("spaces"), runId: v.id("workflowRuns") },
  handler: async (ctx, { spaceId, runId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const run = await ctx.db.get(runId);
    if (!run || run.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(runId, { status: "killed", finishedAt: Date.now() });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      workflowRunId: runId,
      category: "governance",
      action: "run_killed",
      summary: "Run cancelled",
    });
  },
});

export const pauseRun = mutation({
  args: { spaceId: v.id("spaces"), runId: v.id("workflowRuns") },
  handler: async (ctx, { spaceId, runId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const run = await ctx.db.get(runId);
    if (!run || run.spaceId !== spaceId) throw new Error("Not found");
    if (run.status === "running" || run.status === "pending") {
      await ctx.db.patch(runId, { status: "paused" });
    }
  },
});

export const resumeRun = mutation({
  args: { spaceId: v.id("spaces"), runId: v.id("workflowRuns") },
  handler: async (ctx, { spaceId, runId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const run = await ctx.db.get(runId);
    if (!run || run.spaceId !== spaceId) throw new Error("Not found");
    if (run.status === "paused") {
      await ctx.db.patch(runId, { status: "running" });
      await ctx.scheduler.runAfter(0, internal.engine.advanceRun, { runId });
    }
  },
});

export const runs = query({
  args: { spaceId: v.id("spaces"), workflowId: v.optional(v.id("workflows")) },
  handler: async (ctx, { spaceId, workflowId }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("workflowRuns")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(100);
    return workflowId ? rows.filter((r) => r.workflowId === workflowId) : rows;
  },
});

export const runSteps = query({
  args: { spaceId: v.id("spaces"), runId: v.id("workflowRuns") },
  handler: async (ctx, { spaceId, runId }) => {
    await resolveScope(ctx, spaceId);
    const run = await ctx.db.get(runId);
    if (!run || run.spaceId !== spaceId) return [];
    const steps = await ctx.db
      .query("runSteps")
      .withIndex("by_run", (q) => q.eq("workflowRunId", runId))
      .collect();
    return steps.sort((a, b) => a.index - b.index);
  },
});
