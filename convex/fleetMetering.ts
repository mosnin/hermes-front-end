import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { recordWorkEvent } from "./lib/events";

/**
 * Managed-hosting agent-hour metering.
 *
 * Every hour we bill each currently-hosted (vmProvider set, deploymentStatus
 * "running") agent one "hosted_agent_hour" usage row so Space owners see
 * hosting spend alongside their token/message usage in convex/usage.ts, and
 * so convex/costs.ts (operator-side estimate) has a real per-agent-hour signal
 * to reconcile against later.
 *
 * Pricing is a placeholder — tune to your actual Cloudflare Container cost +
 * margin once that's known.
 */
const HOSTED_AGENT_HOURLY_USD = 0.10;

const HOUR_MS = 60 * 60 * 1000;

/** Floor a timestamp to the start of its UTC hour bucket. */
function hourBucketStart(now: number): number {
  return Math.floor(now / HOUR_MS) * HOUR_MS;
}

/**
 * Cron: meter one usage row per hosted (running) agent for the current hour
 * bucket. Paginated + self-chaining like health.sweep so it scales past a
 * single page of agents. Full-table scan of `agents` is acceptable at current
 * scale; there is no index on deploymentStatus/vmProvider alone.
 *
 * Idempotency: before billing an agent we check whether a hosted_agent_hour
 * usage row already exists for that agent in the current hour bucket (via the
 * `by_space_time` index, scoped to the agent's Space, filtered by agentId in
 * memory). A per-run cache avoids re-querying the same Space's usage rows for
 * every agent on the page.
 */
export const runHourly = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const now = Date.now();
    const hourStart = hourBucketStart(now);

    const page = await ctx.db
      .query("agents")
      .paginate({ numItems: 200, cursor: cursor ?? null });

    // spaceId -> Set of agentIds already billed for this hour bucket.
    const billedThisHour = new Map<string, Set<string>>();

    for (const a of page.page) {
      if (a.deploymentStatus !== "running" || !a.vmProvider) continue;

      const spaceKey = a.spaceId as unknown as string;
      let billed = billedThisHour.get(spaceKey);
      if (!billed) {
        const rows = await ctx.db
          .query("usage")
          .withIndex("by_space_time", (q) =>
            q.eq("spaceId", a.spaceId).gte("createdAt", hourStart),
          )
          .collect();
        billed = new Set(
          rows
            .filter((r) => r.kind === "hosted_agent_hour" && r.agentId)
            .map((r) => r.agentId as unknown as string),
        );
        billedThisHour.set(spaceKey, billed);
      }

      const agentKey = a._id as unknown as string;
      if (billed.has(agentKey)) continue; // already billed this hour bucket

      await ctx.db.insert("usage", {
        companyId: a.companyId,
        spaceId: a.spaceId,
        agentId: a._id,
        model: a.model,
        kind: "hosted_agent_hour",
        costUsd: HOSTED_AGENT_HOURLY_USD,
        createdAt: now,
      });
      billed.add(agentKey);

      await recordWorkEvent(ctx, {
        companyId: a.companyId,
        spaceId: a.spaceId,
        actorType: "system",
        agentId: a._id as Id<"agents">,
        category: "billing",
        action: "hosted_agent_hour",
        summary: `Billed 1 hosted-agent-hour for ${a.name} ($${HOSTED_AGENT_HOURLY_USD.toFixed(2)})`,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.fleetMetering.runHourly, {
        cursor: page.continueCursor,
      });
    }
  },
});
