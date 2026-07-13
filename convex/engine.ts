import { v } from "convex/values";
import { internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { Scope } from "./lib/auth";
import { assertRunWithinLimits, GuardViolation } from "./lib/guards";
import { DEFAULT_GUARD_CONFIG } from "./schema";
import { recordWorkEvent, recordActivity, recordNotification } from "./lib/events";
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

/** Capture a terminal failure in the dead-letter queue for inspection/replay. */
async function recordDeadLetter(
  ctx: MutationCtx,
  run: Doc<"workflowRuns">,
  args: {
    kind: "step" | "run" | "stuck_run";
    stepId?: string;
    agentId?: Id<"agents">;
    attempts?: number;
    error: string;
    payload?: unknown;
  },
): Promise<void> {
  await ctx.db.insert("deadLetters", {
    companyId: run.companyId,
    spaceId: run.spaceId,
    kind: args.kind,
    workflowId: run.workflowId,
    workflowRunId: run._id,
    stepId: args.stepId,
    agentId: args.agentId,
    error: args.error,
    attempts: args.attempts,
    payload: args.payload,
    status: "open",
    createdAt: Date.now(),
  });
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
  await recordNotification(ctx, {
    companyId: run.companyId,
    spaceId: run.spaceId,
    type: "run",
    title: "Workflow run failed",
    body: error,
    href: "/dashboard/workflows",
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
        await recordDeadLetter(ctx, run, {
          kind: "run",
          error: "no runnable steps (dependency cycle or all blocked)",
        });
        await failRun(ctx, run, "no runnable steps (dependency cycle or all blocked)");
      }
      return;
    }

    const autoComplete = !!(run.input as { autoComplete?: boolean } | undefined)
      ?.autoComplete;

    // Track hops locally: patching with the stale `run.hops` would advance the
    // counter by only 1 no matter how many steps dispatch this tick, and the
    // ceiling could overshoot by a full batch. Stop dispatching at the limit —
    // the next tick's assertRunWithinLimits fails the run cleanly.
    let hops = run.hops;
    const maxHops = (scope.space.guardConfig ?? DEFAULT_GUARD_CONFIG).maxAgentHops;
    for (const step of ready) {
      if (hops >= maxHops) break;
      const def = stepDefs.get(step.stepId);
      const agent = await resolveAgentForStep(ctx, run.spaceId, def ?? {});
      await ctx.db.patch(step._id, {
        status: "dispatched",
        agentId: agent?._id,
        attempts: step.attempts + 1,
        startedAt: Date.now(),
      });
      hops++;
      await ctx.db.patch(runId, { hops });
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
      // Retry with exponential backoff so a flapping agent isn't hammered.
      const backoff = Math.min(1000 * 2 ** (step.attempts - 1), 30_000);
      await ctx.db.patch(step._id, { status: "pending" });
      await recordActivity(ctx, {
        companyId: run.companyId,
        spaceId: run.spaceId,
        workflowRunId: runId,
        type: "workflow",
        title: `Step retry: ${step.name}`,
        detail: `attempt ${step.attempts}/${maxAttempts}, backoff ${backoff}ms`,
      });
      await ctx.scheduler.runAfter(backoff, internal.engine.advanceRun, { runId });
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
      await recordDeadLetter(ctx, run, {
        kind: "step",
        stepId,
        agentId: step.agentId,
        attempts: step.attempts,
        error: output ?? "step failed",
        payload: { stepName: step.name, instruction: step.instruction },
      });
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
/** Claim all dispatched steps for an agent (marks them running). Shared by the
 * poll endpoint and the combined long-poll so behaviour is identical. */
export async function claimStepsFor(ctx: MutationCtx, agentId: Id<"agents">) {
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
}

export const claimSteps = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => claimStepsFor(ctx, agentId),
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

/**
 * Stuck-run watchdog. A run whose scheduler chain broke (or that wedged waiting
 * on an agent that never reports) can sit in "running" forever. This sweep —
 * driven by an hourly cron — fails any run running longer than a hard ceiling
 * and dead-letters it so a human can inspect/replay. Bounded by .take().
 */
export const sweepStuckRuns = internalMutation({
  args: { olderThanMs: v.optional(v.number()) },
  handler: async (ctx, { olderThanMs }) => {
    const ceiling = olderThanMs ?? 2 * 60 * 60 * 1000; // 2h backstop
    const cutoff = Date.now() - ceiling;
    const stuck = await ctx.db
      .query("workflowRuns")
      .withIndex("by_status_started", (q) =>
        q.eq("status", "running").lt("startedAt", cutoff),
      )
      .take(50);
    let failed = 0;
    for (const run of stuck) {
      await recordDeadLetter(ctx, run, {
        kind: "stuck_run",
        error: `run exceeded ${Math.round(ceiling / 60000)}m wall-clock without completing`,
        payload: { hops: run.hops, stepsDone: run.stepsDone },
      });
      await failRun(ctx, run, "stuck run swept by watchdog");
      failed++;
    }
    return { scanned: stuck.length, failed };
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
