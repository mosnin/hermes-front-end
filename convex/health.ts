import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent, recordNotification } from "./lib/events";
import { cloudflareConfigured, agentStatus, restartAgent } from "./lib/cloudflare";

const DEGRADE_MS = 90_000; // missed heartbeats -> degraded
const OFFLINE_MS = 300_000; // prolonged silence -> offline

// ===========================================================================
// Feature 10 — Self-healing watchdog. HOSTED agents (vmProvider set) that go
// offline get an in-place restart attempt via the fleet worker, with
// exponential backoff between attempts and a hard cap after which the
// watchdog disables itself for that agent and raises an incident requiring a
// human to look. Read-only `agentStatus` double-checks the provider's view
// before restarting (avoids a wasted/duplicate restart if the container is
// actually fine and it's just a heartbeat delivery hiccup); `restartAgent`
// (feature 5, already in lib/cloudflare.ts) performs the in-place reboot.
// ===========================================================================

const WATCHDOG_BASE_MS = 2 * 60_000; // 2 min
const WATCHDOG_CAP_MS = 60 * 60_000; // 60 min ceiling on backoff
const WATCHDOG_MAX_ATTEMPTS = 6; // then disable + require manual intervention

/**
 * Cron: mark agents degraded/offline by heartbeat staleness and alert.
 * Paginated + self-chaining so it scales past a single page of agents.
 */
export const sweep = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const now = Date.now();
    const page = await ctx.db
      .query("agents")
      .paginate({ numItems: 200, cursor: cursor ?? null });
    for (const a of page.page) {
      if (a.kind === "a2a-external") continue;
      const last = a.lastHeartbeat ?? 0;
      const age = now - last;
      let next: typeof a.status | null = null;
      if ((a.status === "online" || a.status === "degraded") && age > OFFLINE_MS) {
        next = "offline";
      } else if (a.status === "online" && age > DEGRADE_MS) {
        next = "degraded";
      }
      if (next && next !== a.status) {
        await ctx.db.patch(a._id, { status: next });
        await ctx.db.insert("activity", {
          companyId: a.companyId,
          spaceId: a.spaceId,
          agentId: a._id,
          type: "alert",
          title: `${a.name} is ${next}`,
          detail: `No heartbeat for ${Math.round(age / 1000)}s`,
          createdAt: now,
        });
        await ctx.db.insert("workEvents", {
          companyId: a.companyId,
          spaceId: a.spaceId,
          actorType: "system",
          agentId: a._id,
          category: "governance",
          action: "agent_health",
          summary: `${a.name} -> ${next} (stale heartbeat)`,
          createdAt: now,
        });
        await recordNotification(ctx, {
          companyId: a.companyId,
          spaceId: a.spaceId,
          type: "alert",
          title: `${a.name} is ${next}`,
          body: `No heartbeat for ${Math.round(age / 1000)}s`,
          href: "/dashboard/ops",
        });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.health.sweep, {
        cursor: page.continueCursor,
      });
    }
  },
});

/** HOSTED agents currently eligible for a watchdog restart attempt, paginated (global cron sweep). */
export const watchdogCandidatesPage = internalQuery({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const now = Date.now();
    const page = await ctx.db
      .query("agents")
      .paginate({ numItems: 200, cursor: cursor ?? null });
    const candidates = page.page.filter(
      (a) =>
        a.kind !== "a2a-external" &&
        !!a.vmProvider &&
        !!a.vmId &&
        a.status === "offline" &&
        !a.watchdogDisabled &&
        (a.nextRestartAt === undefined || now >= a.nextRestartAt),
    );
    return { candidates, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

/**
 * Apply the outcome of one restart attempt: bump the exponential backoff
 * fields, disable the watchdog past WATCHDOG_MAX_ATTEMPTS, and raise an
 * incident (workEvent + activity alert + notification) either way so an
 * auto-restart is never silent.
 */
export const recordRestartOutcome = internalMutation({
  args: {
    agentId: v.id("agents"),
    outcome: v.union(v.literal("restarted"), v.literal("skipped_healthy"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { agentId, outcome, error }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent) return;
    const now = Date.now();

    if (outcome === "skipped_healthy") {
      // The provider reports it's actually up — a heartbeat delivery hiccup,
      // not a dead container. Leave status alone (the heartbeat sweep will
      // flip it back to online on the next beat) and don't burn a backoff slot.
      return;
    }

    const attempts = (agent.restartAttempts ?? 0) + 1;
    const disable = attempts >= WATCHDOG_MAX_ATTEMPTS;
    const backoff = Math.min(WATCHDOG_CAP_MS, WATCHDOG_BASE_MS * 2 ** (attempts - 1));
    await ctx.db.patch(agentId, {
      restartAttempts: attempts,
      lastRestartAt: now,
      nextRestartAt: disable ? undefined : now + backoff,
      watchdogDisabled: disable || undefined,
    });

    const summary = disable
      ? `${agent.name} auto-restart failed ${attempts}x — watchdog disabled, needs manual attention`
      : outcome === "restarted"
        ? `${agent.name} auto-restarted by the watchdog (attempt ${attempts})`
        : `${agent.name} auto-restart attempt ${attempts} failed${error ? `: ${error}` : ""}, retrying in ${Math.round(backoff / 60_000)}m`;

    await recordWorkEvent(ctx, {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      actorType: "system",
      agentId,
      category: "governance",
      action: disable ? "watchdog_disabled" : "agent_auto_restart",
      summary,
      payload: { attempts, outcome, error },
    });
    await ctx.db.insert("activity", {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      agentId,
      type: "alert",
      title: disable ? `${agent.name} needs manual attention` : `${agent.name} auto-restart`,
      detail: summary,
      createdAt: now,
    });
    await recordNotification(ctx, {
      companyId: agent.companyId,
      spaceId: agent.spaceId,
      type: "alert",
      title: disable ? `${agent.name} needs manual attention` : `${agent.name} auto-restarted`,
      body: summary,
      href: `/dashboard/agents/${agentId}`,
    });
  },
});

/**
 * Cron: for every eligible offline HOSTED agent, confirm it's actually dead
 * (read-only `agentStatus`) then attempt an in-place `restartAgent`. Paginated
 * + self-chaining like `sweep`.
 */
export const watchdogTick = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    if (!cloudflareConfigured()) return; // nothing to restart without a fleet worker

    const page: {
      candidates: Doc<"agents">[];
      isDone: boolean;
      continueCursor: string;
    } = await ctx.runQuery(internal.health.watchdogCandidatesPage, { cursor: cursor ?? null });

    for (const agent of page.candidates) {
      try {
        const providerStatus = await agentStatus(agent.vmId as string);
        if (providerStatus === "running" || providerStatus === "active") {
          await ctx.runMutation(internal.health.recordRestartOutcome, {
            agentId: agent._id,
            outcome: "skipped_healthy",
          });
          continue;
        }
        await restartAgent(agent.vmId as string);
        await ctx.runMutation(internal.health.recordRestartOutcome, {
          agentId: agent._id,
          outcome: "restarted",
        });
      } catch (e) {
        await ctx.runMutation(internal.health.recordRestartOutcome, {
          agentId: agent._id,
          outcome: "failed",
          error: e instanceof Error ? e.message.slice(0, 300) : "unknown error",
        });
      }
    }

    if (!page.isDone) {
      await ctx.runAction(internal.health.watchdogTick, { cursor: page.continueCursor });
    }
  },
});

/** Admin control: pause/resume the watchdog for one agent (e.g. during planned maintenance). */
export const setWatchdogDisabled = mutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents"), disabled: v.boolean() },
  handler: async (ctx, { spaceId, agentId, disabled }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(agentId, { watchdogDisabled: disabled });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "governance",
      action: disabled ? "watchdog_disabled_manual" : "watchdog_enabled",
      summary: `${scope.userId} ${disabled ? "disabled" : "enabled"} the auto-restart watchdog for ${agent.name}`,
    });
  },
});

/** Admin control: clear backoff state after fixing the underlying issue, so the watchdog retries immediately. */
export const resetWatchdog = mutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(agentId, {
      restartAttempts: 0,
      nextRestartAt: undefined,
      watchdogDisabled: false,
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "governance",
      action: "watchdog_reset",
      summary: `${scope.userId} reset the auto-restart watchdog for ${agent.name}`,
    });
  },
});

/** Recent health/governance alerts for a Space (for the ops page). */
export const alerts = query({
  args: { spaceId: v.id("spaces"), limit: v.optional(v.number()) },
  handler: async (ctx, { spaceId, limit }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("activity")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(300);
    return rows.filter((r) => r.type === "alert").slice(0, limit ?? 50);
  },
});
