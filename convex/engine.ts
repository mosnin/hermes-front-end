import { v } from "convex/values";
import { internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { Scope } from "./lib/auth";
import { assertRunWithinLimits, GuardViolation } from "./lib/guards";
import { recordWorkEvent, recordActivity } from "./lib/events";
import { recordUsage } from "./lib/metering";

const DEFAULT_STEP_TIMEOUT_MS = 60_000;
const AUTO_COMPLETE_DELAY_MS = 1500;

/** Build a guard scope from a Space doc (engine runs without a user identity). */
async function scopeOf(ctx: MutationCtx, spaceId: Id<"spaces">): Promise<Scope> {
  const space = await ctx.db.get(spaceId);
  if (!space) throw new Error("Space not found");
  return {
    userId: "engine",
    companyId: space.companyId,
    spaceId,
    space,
    role: "operator",
  };
}

async function resolveAgentForStep(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
  step: { agentId?: Id<"agents">; requiresCapability?: string },
): Promise<Doc<"agents"> | null> {
  if (step.agentId) {
    const a = await ctx.db.get(step.agentId);
    return a && a.spaceId === spaceId ? a : null;
  }
  const agents = await ctx.db
    .query("agents")
    .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
    .collect();
  const online = agents.filter((a) => a.status === "online");
  const pool = online.length ? online : agents;
  if (step.requiresCapability) {
    return (
      pool.find((a) => (a.capabilities ?? []).includes(step.requiresCapability!)) ??
      null
    );
  }
  return pool[0] ?? null;
}

async function failRun(
  ctx: MutationCtx,
  run: Doc<"workflowRuns">,
  error: string,
): Promise<void> {
  await ctx.db.patch(run._id, {
    status: "failed",
    error,
    finishedAt: Date.now(),
  });
  await recordWorkEvent(ctx, {
    companyId: run.companyId,
    spaceId: run.spaceId,
    actorType: "workflow",
    workflowRunId: run._id,
    category: "workflow",
    action: "run_failed",
    summary: `Workflow run failed: ${error}`,
  });
}

/**
 * The heartbeat of a run. Idempotent: dispatches any newly-ready steps, and
 * advances the run to completion/failure. Re-invoked after each step finishes.
 */
export const advanceRun = internalMutation({
  args: { runId: v.id("workflowRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) return;
    if (run.status === "killed" || run.status === "completed" || run.status === "failed") {
      return;
    }

    const scope = await scopeOf(ctx, run.spaceId);

    // Kill switch — halt and park the run.
    if (scope.space.autonomyPaused) {
      if (run.status !== "paused") {
        await ctx.db.patch(runId, { status: "paused" });
        await recordWorkEvent(ctx, {
          companyId: run.companyId,
          spaceId: run.spaceId,
          actorType: "system",
          workflowRunId: runId,
          category: "governance",
          action: "run_paused",
          summary: "Run paused by kill switch",
        });
      }
      return;
    }
    if (run.status === "paused") return; // resumed explicitly elsewhere

    if (run.status === "pending") {
      await ctx.db.patch(runId, { status: "running" });
    }

    // Runaway guards (hops / steps / wall-clock).
    try {
      assertRunWithinLimits(scope, run);
    } catch (e) {
      if (e instanceof GuardViolation) {
        await failRun(ctx, run, e.message);
        return;
      }
      throw e;
    }

    const steps = await ctx.db
      .query("runSteps")
      .withIndex("by_run", (q) => q.eq("workflowRunId", runId))
      .collect();

    if (steps.every((s) => s.status === "done" || s.status === "skipped")) {
      await ctx.db.patch(runId, { status: "completed", finishedAt: Date.now() });
      await recordWorkEvent(ctx, {
        companyId: run.companyId,
        spaceId: run.spaceId,
        actorType: "workflow",
        workflowRunId: runId,
        category: "workflow",
        action: "run_completed",
        summary: "Workflow run completed",
      });
      return;
    }

    const doneIds = new Set(
      steps.filter((s) => s.status === "done").map((s) => s.stepId),
    );
    const inFlight = steps.some(
      (s) => s.status === "dispatched" || s.status === "running",
    );

    // Steps whose dependencies are all satisfied.
    const wf = await ctx.db.get(run.workflowId);
    const stepDefs = new Map((wf?.steps ?? []).map((s) => [s.id, s]));
    const ready = steps.filter((s) => {
      if (s.status !== "pending") return false;
      const def = stepDefs.get(s.stepId);
      const deps = def?.dependsOn ?? [];
      return deps.every((d) => doneIds.has(d));
    });

    if (ready.length === 0) {
      if (!inFlight) {
        await failRun(ctx, run, "no runnable steps (dependency cycle or all blocked)");
      }
      return;
    }

    const autoComplete = !!(run.input as { autoComplete?: boolean } | undefined)
      ?.autoComplete;

    for (const step of ready) {
      const def = stepDefs.get(step.stepId);
      const agent = await resolveAgentForStep(ctx, run.spaceId, def ?? {});
      await ctx.db.patch(step._id, {
        status: "dispatched",
        agentId: agent?._id,
        attempts: step.attempts + 1,
        startedAt: Date.now(),
      });
      await ctx.db.patch(runId, { hops: run.hops + 1 });
      await recordActivity(ctx, {
        companyId: run.companyId,
        spaceId: run.spaceId,
        agentId: agent?._id,
        workflowRunId: runId,
        type: "workflow",
        title: `Step dispatched: ${step.name}`,
        detail: agent ? `→ ${agent.name}` : "no agent available",
      });

      if (autoComplete || !agent) {
        // Demo / dry-run path (or no agent connected): synthesize completion.
        await ctx.scheduler.runAfter(
          AUTO_COMPLETE_DELAY_MS,
          internal.engine.completeStep,
          {
            runId,
            stepId: step.stepId,
            ok: true,
            output: agent
              ? `(${agent.name}) completed: ${step.name}`
              : `(auto) ${step.name} — no agent connected`,
          },
        );
      } else {
        // Real path: agent picks up via /workflow/inbox and reports a result.
        const timeout = def?.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
        await ctx.scheduler.runAfter(timeout, internal.engine.stepTimeout, {
          runId,
          stepId: step.stepId,
        });
      }
    }
  },
});

/** Mark a step complete (from the connector result or the auto path). */
export const completeStep = internalMutation({
  args: {
    runId: v.id("workflowRuns"),
    stepId: v.string(),
    ok: v.boolean(),
    output: v.optional(v.string()),
  },
  handler: async (ctx, { runId, stepId, ok, output }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.status === "killed") return;
    const step = await ctx.db
      .query("runSteps")
      .withIndex("by_run", (q) => q.eq("workflowRunId", runId))
      .collect()
      .then((rows) => rows.find((s) => s.stepId === stepId));
    if (!step) return;
    if (step.status === "done" || step.status === "failed" || step.status === "skipped") {
      return; // idempotent
    }

    const wf = await ctx.db.get(run.workflowId);
    const def = wf?.steps.find((s) => s.id === stepId);
    const maxAttempts = def?.maxAttempts ?? 2;

    if (!ok && step.attempts < maxAttempts) {
      // Retry: re-queue the step for another dispatch.
      await ctx.db.patch(step._id, { status: "pending" });
      await recordActivity(ctx, {
        companyId: run.companyId,
        spaceId: run.spaceId,
        workflowRunId: runId,
        type: "workflow",
        title: `Step retry: ${step.name}`,
        detail: `attempt ${step.attempts}/${maxAttempts}`,
      });
      await ctx.scheduler.runAfter(0, internal.engine.advanceRun, { runId });
      return;
    }

    await ctx.db.patch(step._id, {
      status: ok ? "done" : "failed",
      output: output,
      error: ok ? undefined : output ?? "step failed",
      finishedAt: Date.now(),
    });
    await ctx.db.patch(runId, { stepsDone: run.stepsDone + 1 });
    await recordWorkEvent(ctx, {
      companyId: run.companyId,
      spaceId: run.spaceId,
      actorType: "agent",
      agentId: step.agentId,
      workflowRunId: runId,
      category: "workflow",
      action: ok ? "step_done" : "step_failed",
      summary: `${ok ? "Completed" : "Failed"} step: ${step.name}`,
      payload: output ? { output } : undefined,
    });

    if (!ok) {
      await failRun(ctx, run, `step "${step.name}" failed after ${step.attempts} attempts`);
      return;
    }
    await recordUsage(ctx, {
      companyId: run.companyId,
      spaceId: run.spaceId,
      agentId: step.agentId,
      kind: "step",
    });
    await ctx.scheduler.runAfter(0, internal.engine.advanceRun, { runId });
  },
});

/** A connector claims its dispatched workflow steps (marks them running). */
export const claimSteps = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const dispatched = await ctx.db
      .query("runSteps")
      .withIndex("by_agent_status", (q) =>
        q.eq("agentId", agentId).eq("status", "dispatched"),
      )
      .collect();
    const out = [];
    for (const s of dispatched) {
      await ctx.db.patch(s._id, { status: "running" });
      out.push({
        runId: s.workflowRunId,
        stepId: s.stepId,
        name: s.name,
        instruction: s.instruction,
      });
    }
    return out;
  },
});

/** A connector reports a step result. Validates ownership, then completes. */
export const reportResult = internalMutation({
  args: {
    agentId: v.id("agents"),
    runId: v.id("workflowRuns"),
    stepId: v.string(),
    ok: v.boolean(),
    output: v.optional(v.string()),
  },
  handler: async (ctx, { agentId, runId, stepId, ok, output }) => {
    const step = (
      await ctx.db
        .query("runSteps")
        .withIndex("by_run", (q) => q.eq("workflowRunId", runId))
        .collect()
    ).find((s) => s.stepId === stepId);
    if (!step || step.agentId !== agentId) return { ok: false };
    await ctx.scheduler.runAfter(0, internal.engine.completeStep, {
      runId,
      stepId,
      ok,
      output,
    });
    return { ok: true };
  },
});

/** Timeout watchdog for a dispatched step (real-agent path). */
export const stepTimeout = internalMutation({
  args: { runId: v.id("workflowRuns"), stepId: v.string() },
  handler: async (ctx, { runId, stepId }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.status === "killed" || run.status === "completed" || run.status === "failed") {
      return;
    }
    const step = (
      await ctx.db
        .query("runSteps")
        .withIndex("by_run", (q) => q.eq("workflowRunId", runId))
        .collect()
    ).find((s) => s.stepId === stepId);
    if (!step) return;
    if (step.status === "done" || step.status === "failed" || step.status === "skipped") {
      return; // already resolved
    }
    // Treat a timeout as a failed attempt → completeStep handles retry/fail.
    await ctx.scheduler.runAfter(0, internal.engine.completeStep, {
      runId,
      stepId,
      ok: false,
      output: "step timed out waiting for the agent",
    });
  },
});
