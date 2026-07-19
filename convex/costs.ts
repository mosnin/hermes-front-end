import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent, recordNotification } from "./lib/events";
import { monthBucket, readCounterQuery } from "./lib/counters";
import { terminateAgent, cloudflareConfigured } from "./lib/cloudflare";

/**
 * Operator infra-cost ESTIMATOR (read-only).
 *
 * The platform OPERATOR pays Convex / Vercel / Clerk; users pay their own agent
 * compute + LLM tokens (tracked separately in the `usage` table). We cannot read
 * Convex's real invoice from here, so this module ESTIMATES the operator's
 * Convex-driven cost for a Space from OBSERVABLE activity (agent counts + this
 * month's event rows) multiplied by tunable assumptions.
 *
 * Everything below is an APPROXIMATION. Treat the output as a directional model,
 * not a bill. Tune the constants to your actual Convex plan + connector loop.
 */

// === ASSUMPTIONS (edit these to match your deployment) =====================
// --- Always-on agent poll/heartbeat traffic (the dominant driver) ----------
// A connector polling on a 2s loop makes ~86,400 function calls/agent/day.
const POLL_INTERVAL_SECONDS = 2;
const SECONDS_PER_DAY = 86_400;
const POLL_CALLS_PER_AGENT_PER_DAY = Math.round(
  SECONDS_PER_DAY / POLL_INTERVAL_SECONDS,
); // ≈ 43,200 at 2s; the 86,400 figure assumes a 1s loop. Tune to your loop.
// Heartbeats roughly every 30s ⇒ ~2,880/day.
const HEARTBEATS_PER_DAY = 2_880;

// --- Writes amplification per logical event --------------------------------
// One A2A message fans out to several DB writes (message row, recipient index
// touch, work event, activity, notification, ...).
const WRITES_PER_A2A = 5;
// One workflow step does more (run step row, run patch, work event, activity,
// usage, action ledger, ...).
const WRITES_PER_STEP = 8;
// Generic events (activity / workEvents / usage rows) ≈ 1 write each already,
// but each also triggers ~1 function call to produce it.
const WRITES_PER_GENERIC_EVENT = 1;

// --- Convex unit prices (APPROXIMATE — tune to your Convex plan) -----------
// Convex meters function calls, database bandwidth, and storage. We model the
// two activity-driven dimensions with simple per-call / per-write dollar
// constants. These are intentionally rough; replace with your plan's rates.
const CONVEX_FN_CALL_USD = 2 / 1e6; // ~$2 per 1M function calls
const CONVEX_WRITE_USD = 1 / 1e6; // ~$1 per 1M document writes (bandwidth proxy)

const DAYS_PER_MONTH = 30;

/** Days elapsed so far in the current UTC month (>=1), for month-to-date math. */
function daysElapsedThisMonth(now: number, monthStart: number): number {
  return Math.max(1, (now - monthStart) / (1000 * 60 * 60 * 24));
}

/** Project poll function-calls/month for a given poll interval (seconds). */
function pollCallsPerMonth(alwaysOnAgents: number, intervalSeconds: number): number {
  const callsPerAgentPerDay = SECONDS_PER_DAY / intervalSeconds;
  return Math.round(alwaysOnAgents * callsPerAgentPerDay * DAYS_PER_MONTH);
}

/**
 * Estimate this Space's monthly operator Convex cost from observable activity.
 * Pure, read-only. Does NOT represent the real Convex bill.
 */
export const estimate = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);

    const now = Date.now();
    const d = new Date(now);
    const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const elapsedDays = daysElapsedThisMonth(now, monthStart);

    // --- Agents: how many, and how many are "always-on" (status online) ----
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const totalAgents = agents.length;
    const alwaysOnAgents = agents.filter((a) => a.status === "online").length;

    // --- This month's event rows (drive event function calls + writes) ------
    const a2a = await ctx.db
      .query("a2aMessages")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", monthStart),
      )
      .collect();

    // runSteps has no by_space_time index; it's indexed by_run. Pull this
    // month's runs for the Space, then their steps.
    const runs = await ctx.db
      .query("workflowRuns")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const runsThisMonth = runs.filter((r) => r.startedAt >= monthStart);
    let runSteps = 0;
    for (const r of runsThisMonth) {
      const steps = await ctx.db
        .query("runSteps")
        .withIndex("by_run", (q) => q.eq("workflowRunId", r._id))
        .collect();
      runSteps += steps.length;
    }

    const activity = await ctx.db
      .query("activity")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", monthStart),
      )
      .collect();

    const workEvents = await ctx.db
      .query("workEvents")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", monthStart),
      )
      .collect();

    const usageRows = await ctx.db
      .query("usage")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", monthStart),
      )
      .collect();

    const a2aCount = a2a.length;
    const activityCount = activity.length;
    const workEventCount = workEvents.length;
    const usageCount = usageRows.length;
    const genericEvents = activityCount + workEventCount + usageCount;

    // --- Poll/heartbeat calls (steady-state, projected over the month) ------
    const estPollCallsPerMonth = Math.round(
      alwaysOnAgents *
        (POLL_CALLS_PER_AGENT_PER_DAY + HEARTBEATS_PER_DAY) *
        DAYS_PER_MONTH,
    );

    // --- Event-driven calls: extrapolate month-to-date to a full month ------
    const observedEventCalls =
      a2aCount + runSteps + genericEvents; // ~1 fn call produced each row
    const monthFactor = DAYS_PER_MONTH / elapsedDays;
    const estEventCallsPerMonth = Math.round(observedEventCalls * monthFactor);

    const estTotalFnCalls = estPollCallsPerMonth + estEventCallsPerMonth;

    // --- Writes: poll/heartbeat are mostly reads; events amplify to writes --
    const observedWrites =
      a2aCount * WRITES_PER_A2A +
      runSteps * WRITES_PER_STEP +
      genericEvents * WRITES_PER_GENERIC_EVENT;
    const estWritesPerMonth = Math.round(observedWrites * monthFactor);

    // --- Cost: function calls + write bandwidth -----------------------------
    const pollCostUsd = estPollCallsPerMonth * CONVEX_FN_CALL_USD;
    const eventCallCostUsd = estEventCallsPerMonth * CONVEX_FN_CALL_USD;
    const writeCostUsd = estWritesPerMonth * CONVEX_WRITE_USD;
    const estConvexCostUsd = pollCostUsd + eventCallCostUsd + writeCostUsd;

    // --- Lever: same agents, cheaper transport ------------------------------
    const poll2s = pollCallsPerMonth(alwaysOnAgents, 2);
    const poll10s = pollCallsPerMonth(alwaysOnAgents, 10);
    const eventPush = 0; // event-push ⇒ no idle polling at all
    const heartbeatCallsPerMonth = Math.round(
      alwaysOnAgents * HEARTBEATS_PER_DAY * DAYS_PER_MONTH,
    );
    const projection = (pollCalls: number) => {
      const fnCalls = pollCalls + heartbeatCallsPerMonth + estEventCallsPerMonth;
      const costUsd =
        (pollCalls + heartbeatCallsPerMonth) * CONVEX_FN_CALL_USD +
        eventCallCostUsd +
        writeCostUsd;
      return { pollCalls, fnCalls, costUsd };
    };

    return {
      monthStart,
      elapsedDays: Math.round(elapsedDays * 10) / 10,
      totalAgents,
      alwaysOnAgents,
      estPollCallsPerMonth,
      estEventCallsPerMonth,
      estTotalFnCalls,
      estWritesPerMonth,
      estConvexCostUsd,
      byCategory: {
        poll: { fnCalls: estPollCallsPerMonth - heartbeatCallsPerMonth, costUsd: pollCostUsd - heartbeatCallsPerMonth * CONVEX_FN_CALL_USD },
        heartbeat: {
          fnCalls: heartbeatCallsPerMonth,
          costUsd: heartbeatCallsPerMonth * CONVEX_FN_CALL_USD,
        },
        events: { fnCalls: estEventCallsPerMonth, costUsd: eventCallCostUsd },
        writes: { writes: estWritesPerMonth, costUsd: writeCostUsd },
      },
      observed: {
        a2aMessages: a2aCount,
        runSteps,
        activity: activityCount,
        workEvents: workEventCount,
        usageRows: usageCount,
      },
      // The "lever": polling is the dominant idle cost. Stretch the interval or
      // switch to event-push and the projected monthly $ drops accordingly.
      lever: {
        poll2s: projection(poll2s),
        poll10s: projection(poll10s),
        eventPush: projection(eventPush),
      },
      assumptions: {
        POLL_INTERVAL_SECONDS,
        POLL_CALLS_PER_AGENT_PER_DAY,
        HEARTBEATS_PER_DAY,
        WRITES_PER_A2A,
        WRITES_PER_STEP,
        WRITES_PER_GENERIC_EVENT,
        CONVEX_FN_CALL_USD,
        CONVEX_WRITE_USD,
        DAYS_PER_MONTH,
        note: "Estimate only — NOT the real Convex bill. Tune constants in convex/costs.ts to your plan + connector loop.",
      },
    };
  },
});

// =============================================================================
// Cost controls to the metal (feature 18): idle-hibernation policy + hard
// spend caps that stop hosted VMs. Everything below is real enforcement, not
// an estimate — it patches `agents`/`spaces` and (best-effort) calls the
// Cloudflare fleet worker to actually stop compute.
//
// Cross-team request (Team A / fleet worker): there's currently no
// resumable pause/resume pair — only /spawn (new VM) and /terminate (destroy
// VM). Hibernation below uses /terminate as its "stop" primitive, which means
// waking a hibernated agent today requires a fresh hosted deploy from the
// Fleet page, not a true resume. Please add /pause + /resume (or a
// stop-preserving-state /stop) to lib/cloudflare.ts + the worker so
// costs.wakeAgent can actually restart the same container instead of just
// flipping idleState.
//
// Cross-team note (health.sweep / connector, not owned by this team): idle
// detection reads `agents.lastWorkAt` with a fallback to `lastHeartbeat`.
// `lastWorkAt` is documented in schema.ts as "maintained by health sweep" —
// please bump it whenever an agent produces a work event so idle detection
// reflects real work, not just liveness.
// =============================================================================

/** Current cost-control policy for a Space (null = using defaults everywhere). */
export const getCostPolicy = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    return scope.space.costPolicy ?? null;
  },
});

/** Update a Space's cost-control policy (admin+ — this can stop production VMs). */
export const setCostPolicy = mutation({
  args: {
    spaceId: v.id("spaces"),
    hibernationEnabled: v.optional(v.boolean()),
    idleHibernateMinutes: v.optional(v.number()),
    hardCapUsd: v.optional(v.number()),
    hardCapAction: v.optional(v.union(v.literal("pause"), v.literal("stop_vms"))),
  },
  handler: async (ctx, { spaceId, ...policy }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    if (policy.idleHibernateMinutes !== undefined && policy.idleHibernateMinutes < 5) {
      throw new Error("idleHibernateMinutes must be at least 5");
    }
    if (policy.hardCapUsd !== undefined && policy.hardCapUsd < 0) {
      throw new Error("hardCapUsd must be >= 0");
    }
    await ctx.db.patch(spaceId, {
      costPolicy: { ...(scope.space.costPolicy ?? {}), ...policy },
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "governance",
      action: "cost_policy_updated",
      summary: "Updated cost controls (hibernation / hard spend cap)",
    });
  },
});

/** Per-agent hard spend cap in USD (0/undefined = space policy only). */
export const setAgentSpendCap = mutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents"), spendCapUsd: v.optional(v.number()) },
  handler: async (ctx, { spaceId, agentId, spendCapUsd }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Agent not found");
    if (spendCapUsd !== undefined && spendCapUsd < 0) throw new Error("spendCapUsd must be >= 0");
    await ctx.db.patch(agentId, { spendCapUsd });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "governance",
      action: "agent_spend_cap_set",
      summary: spendCapUsd
        ? `Set spend cap for ${agent.name} to $${spendCapUsd}/mo`
        : `Cleared spend cap for ${agent.name}`,
    });
  },
});

/** Opt an agent out of idle hibernation (e.g. it's expected to sit idle). */
export const setHibernationExempt = mutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents"), exempt: v.boolean() },
  handler: async (ctx, { spaceId, agentId, exempt }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Agent not found");
    await ctx.db.patch(agentId, { hibernationExempt: exempt });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "governance",
      action: "hibernation_exempt_set",
      summary: `${exempt ? "Exempted" : "Un-exempted"} ${agent.name} from idle hibernation`,
    });
  },
});

/**
 * Manually wake a hibernated/idle agent. NOTE: this flips idleState back to
 * "active" but does NOT re-provision compute — if the container was actually
 * terminated (hibernate stopped it), the VM is gone and a real restart
 * requires a fresh hosted deploy from the Fleet page until Team A ships a
 * resumable /pause + /resume pair (see module header).
 */
export const wakeAgent = mutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Agent not found");
    await ctx.db.patch(agentId, { idleState: "active", hibernatedAt: undefined });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "governance",
      action: "agent_woken",
      summary: `Marked ${agent.name} active (redeploy from Fleet if its VM was terminated)`,
    });
  },
});

/** Hosted agents in the Space with their idle/hibernation state, for the cost page. */
export const fleetIdleStatus = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return agents
      .filter((a) => a.vmProvider)
      .map((a) => ({
        _id: a._id,
        name: a.name,
        idleState: a.idleState ?? "active",
        lastWorkAt: a.lastWorkAt ?? a.lastHeartbeat ?? null,
        hibernatedAt: a.hibernatedAt ?? null,
        hibernationExempt: a.hibernationExempt ?? false,
        spendCapUsd: a.spendCapUsd ?? null,
        deploymentStatus: a.deploymentStatus ?? null,
      }));
  },
});

// --- Internal: idle-hibernation sweep (cron-driven; request registration in
// crons.ts from the integrator — see costs.test.ts for the expected shape) --

const DEFAULT_IDLE_MINUTES = 30;

export const listSpacesForCostEnforcement = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Bounded scan across all Spaces — same pattern as admin.platformStats /
    // alerts.evaluateAll. Intentionally NOT filtered to
    // costPolicy.hibernationEnabled/hardCapUsd here: a per-agent spendCapUsd
    // can be set independently of the Space-level policy, and there's no
    // index to test "any agent in this Space has a spend cap" cheaply. The
    // sweep/enforcement actions below each do their own cheap early-exit
    // per Space (skip hibernation work when disabled, skip hard-cap work
    // when unset, skip agent-cap work when no agent has one) so this broader
    // base list doesn't turn into wasted work.
    return await ctx.db.query("spaces").take(5000);
  },
});

type IdlePhase = "mark_idle" | "hibernate" | "reactivate";

export const idleCandidates = internalQuery({
  args: { spaceId: v.id("spaces"), idleMinutes: v.number() },
  handler: async (ctx, { spaceId, idleMinutes }) => {
    const now = Date.now();
    const idleMs = idleMinutes * 60_000;
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const out: { agentId: Id<"agents">; vmId: string | null; phase: IdlePhase }[] = [];
    for (const a of agents) {
      if (!a.vmProvider || a.hibernationExempt) continue;
      const lastActive = a.lastWorkAt ?? a.lastHeartbeat ?? a.createdAt;
      const idleFor = now - lastActive;
      const state = a.idleState ?? "active";
      if (state === "hibernated") continue; // wake is manual (see wakeAgent)
      if (idleFor < idleMs) {
        if (state === "idle") out.push({ agentId: a._id, vmId: a.vmId ?? null, phase: "reactivate" });
        continue;
      }
      if (idleFor >= idleMs * 2) {
        out.push({ agentId: a._id, vmId: a.vmId ?? null, phase: "hibernate" });
      } else if (state !== "idle") {
        out.push({ agentId: a._id, vmId: a.vmId ?? null, phase: "mark_idle" });
      }
    }
    return out;
  },
});

export const applyIdleTransition = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    phase: v.union(v.literal("mark_idle"), v.literal("reactivate")),
  },
  handler: async (ctx, { spaceId, agentId, phase }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return;
    await ctx.db.patch(agentId, { idleState: phase === "mark_idle" ? "idle" : "active" });
  },
});

export const applyHibernated = internalMutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents"), stopped: v.boolean() },
  handler: async (ctx, { spaceId, agentId, stopped }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return;
    const space = await ctx.db.get(spaceId);
    await ctx.db.patch(agentId, {
      idleState: "hibernated",
      hibernatedAt: Date.now(),
      ...(stopped
        ? { deploymentStatus: "stopped" as const, status: "offline" as const, vmId: undefined }
        : {}),
    });
    if (space) {
      await recordWorkEvent(ctx, {
        companyId: space.companyId,
        spaceId,
        actorType: "system",
        agentId,
        category: "governance",
        action: "agent_hibernated",
        summary: `${agent.name} hibernated after being idle${stopped ? " (VM stopped)" : ""}`,
      });
    }
  },
});

/** Idle-hibernation sweep. Runs as an action so it can call the fleet worker. */
export const sweepIdleHibernation = internalAction({
  args: {},
  handler: async (ctx) => {
    const spaces: Doc<"spaces">[] = await ctx.runQuery(
      internal.costs.listSpacesForCostEnforcement,
      {},
    );
    for (const space of spaces) {
      const policy = space.costPolicy;
      if (!policy?.hibernationEnabled) continue;
      const idleMinutes = policy.idleHibernateMinutes ?? DEFAULT_IDLE_MINUTES;
      const candidates: { agentId: Id<"agents">; vmId: string | null; phase: IdlePhase }[] =
        await ctx.runQuery(internal.costs.idleCandidates, { spaceId: space._id, idleMinutes });
      for (const c of candidates) {
        if (c.phase === "hibernate") {
          let stopped = false;
          if (c.vmId && cloudflareConfigured()) {
            try {
              await terminateAgent(c.vmId);
              stopped = true;
            } catch {
              // best-effort: still mark hibernated so it stops being billed
              // as "active" in the dashboard even if the network call failed.
            }
          }
          await ctx.runMutation(internal.costs.applyHibernated, {
            spaceId: space._id,
            agentId: c.agentId,
            stopped,
          });
        } else {
          await ctx.runMutation(internal.costs.applyIdleTransition, {
            spaceId: space._id,
            agentId: c.agentId,
            phase: c.phase,
          });
        }
      }
    }
  },
});

// --- Internal: hard spend cap enforcement -----------------------------------

export const spendThisMonth = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const { valueUsd } = await readCounterQuery(ctx, spaceId, "usage", monthBucket());
    return valueUsd;
  },
});

export const hostedAgentsToStop = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return agents
      .filter((a) => a.vmProvider && (a.deploymentStatus === "running" || a.deploymentStatus === "provisioning"))
      .map((a) => ({ agentId: a._id, vmId: a.vmId ?? null }));
  },
});

export const applySpendCapPause = internalMutation({
  args: { spaceId: v.id("spaces"), stoppedAgentIds: v.array(v.id("agents")) },
  handler: async (ctx, { spaceId, stoppedAgentIds }) => {
    const space = await ctx.db.get(spaceId);
    if (!space) return;
    await ctx.db.patch(spaceId, { autonomyPaused: true });
    for (const agentId of stoppedAgentIds) {
      const agent = await ctx.db.get(agentId);
      if (!agent || agent.spaceId !== spaceId) continue;
      await ctx.db.patch(agentId, { deploymentStatus: "stopped", status: "offline", vmId: undefined });
    }
    await recordWorkEvent(ctx, {
      companyId: space.companyId,
      spaceId,
      actorType: "system",
      category: "governance",
      action: "hard_cap_enforced",
      summary: `Hard spend cap reached — autonomy paused${
        stoppedAgentIds.length ? ` and ${stoppedAgentIds.length} hosted agent(s) stopped` : ""
      }`,
    });
    await recordNotification(ctx, {
      companyId: space.companyId,
      spaceId,
      type: "alert",
      title: "Hard spend cap reached",
      body: `Autonomy paused${
        stoppedAgentIds.length ? ` and ${stoppedAgentIds.length} hosted VM(s) stopped` : ""
      }. Raise the cap in Cost controls to resume.`,
    });
  },
});

export const agentsWithSpendCap = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return agents
      .filter((a) => (a.spendCapUsd ?? 0) > 0 && a.deploymentStatus !== "stopped")
      .map((a) => ({ agentId: a._id, vmId: a.vmId ?? null, spendCapUsd: a.spendCapUsd as number }));
  },
});

/** This month's usage cost per agent (bounded scan; usage has no by_agent index). */
export const usageCostByAgentThisMonth = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const d = new Date();
    const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const rows = await ctx.db
      .query("usage")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId).gte("createdAt", monthStart))
      .take(5000);
    const byAgent: Record<string, number> = {};
    for (const r of rows) {
      if (!r.agentId) continue;
      byAgent[r.agentId] = (byAgent[r.agentId] ?? 0) + (r.costUsd ?? 0);
    }
    return byAgent;
  },
});

export const applyAgentSpendCapStop = internalMutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) return;
    const space = await ctx.db.get(spaceId);
    await ctx.db.patch(agentId, { deploymentStatus: "stopped", status: "offline", vmId: undefined });
    if (space) {
      await recordWorkEvent(ctx, {
        companyId: space.companyId,
        spaceId,
        actorType: "system",
        agentId,
        category: "governance",
        action: "agent_spend_cap_enforced",
        summary: `${agent.name} hit its per-agent spend cap and was stopped`,
      });
      await recordNotification(ctx, {
        companyId: space.companyId,
        spaceId,
        type: "alert",
        title: "Agent spend cap reached",
        body: `${agent.name} was stopped after exceeding its per-agent spend cap.`,
      });
    }
  },
});

/**
 * Hard spend cap enforcement. Runs as an action (network calls to stop VMs).
 * Two independent checks per Space: (1) the Space-level hard cap
 * (costPolicy.hardCapUsd) against month-to-date spend, and (2) any per-agent
 * spendCapUsd against that agent's month-to-date usage cost.
 */
export const enforceSpendCaps = internalAction({
  args: {},
  handler: async (ctx) => {
    const spaces: Doc<"spaces">[] = await ctx.runQuery(
      internal.costs.listSpacesForCostEnforcement,
      {},
    );
    for (const space of spaces) {
      // --- Space-level hard cap ---
      const cap = space.costPolicy?.hardCapUsd ?? 0;
      if (cap > 0 && !space.autonomyPaused) {
        const spend: number = await ctx.runQuery(internal.costs.spendThisMonth, {
          spaceId: space._id,
        });
        if (spend >= cap) {
          const stoppedIds: Id<"agents">[] = [];
          if (space.costPolicy?.hardCapAction === "stop_vms") {
            const hosted: { agentId: Id<"agents">; vmId: string | null }[] =
              await ctx.runQuery(internal.costs.hostedAgentsToStop, { spaceId: space._id });
            for (const h of hosted) {
              if (h.vmId && cloudflareConfigured()) {
                try {
                  await terminateAgent(h.vmId);
                } catch {
                  // best-effort; still record it as stopped in our records
                }
              }
              stoppedIds.push(h.agentId);
            }
          }
          await ctx.runMutation(internal.costs.applySpendCapPause, {
            spaceId: space._id,
            stoppedAgentIds: stoppedIds,
          });
        }
      }

      // --- Per-agent spend caps ---
      const capped: { agentId: Id<"agents">; vmId: string | null; spendCapUsd: number }[] =
        await ctx.runQuery(internal.costs.agentsWithSpendCap, { spaceId: space._id });
      if (capped.length === 0) continue;
      const costByAgent: Record<string, number> = await ctx.runQuery(
        internal.costs.usageCostByAgentThisMonth,
        { spaceId: space._id },
      );
      for (const c of capped) {
        const spent = costByAgent[c.agentId] ?? 0;
        if (spent < c.spendCapUsd) continue;
        if (c.vmId && cloudflareConfigured()) {
          try {
            await terminateAgent(c.vmId);
          } catch {
            // best-effort
          }
        }
        await ctx.runMutation(internal.costs.applyAgentSpendCapStop, {
          spaceId: space._id,
          agentId: c.agentId,
        });
      }
    }
  },
});
