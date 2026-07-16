import { v } from "convex/values";
import { query, mutation, internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";

const KIND = v.union(v.literal("daily"), v.literal("weekly"), v.literal("custom"));

export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("reports")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(50);
  },
});

/** Build a digest from the work record over a period and persist it. */
async function buildReport(
  ctx: MutationCtx,
  space: Doc<"spaces">,
  kind: "daily" | "weekly" | "custom",
): Promise<Id<"reports">> {
  const periodEnd = Date.now();
  const span = kind === "weekly" ? 7 * 86_400_000 : 86_400_000;
  const periodStart = periodEnd - span;

  const events = await ctx.db
    .query("workEvents")
    .withIndex("by_space_time", (q) =>
      q.eq("spaceId", space._id).gte("createdAt", periodStart),
    )
    .collect();

  const byCategory: Record<string, number> = {};
  for (const e of events) byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;

  const runsCompleted = events.filter((e) => e.action === "run_completed").length;
  const a2a = byCategory["a2a"] ?? 0;
  const stepsDone = events.filter((e) => e.action === "step_done").length;

  const summary =
    events.length === 0
      ? "No recorded activity in this period."
      : [
          `${events.length} events recorded.`,
          `${runsCompleted} workflow run(s) completed, ${stepsDone} step(s) executed.`,
          `${a2a} agent-to-agent message(s).`,
          `Top categories: ${Object.entries(byCategory)
            .sort((x, y) => y[1] - x[1])
            .slice(0, 4)
            .map(([k, n]) => `${k} (${n})`)
            .join(", ")}.`,
        ].join(" ");

  return await ctx.db.insert("reports", {
    companyId: space.companyId,
    spaceId: space._id,
    kind,
    periodStart,
    periodEnd,
    title: `${kind[0].toUpperCase()}${kind.slice(1)} digest`,
    summary,
    metrics: { events: events.length, byCategory, runsCompleted, stepsDone, a2a },
    createdAt: periodEnd,
  });
}

export const generate = mutation({
  args: { spaceId: v.id("spaces"), kind: KIND },
  handler: async (ctx, { spaceId, kind }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    return await buildReport(ctx, scope.space, kind);
  },
});

/**
 * Cron: generate a daily digest per active Space. Paginated + self-chaining,
 * and skips Spaces whose autonomy is paused.
 */
export const generateAllDaily = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("spaces")
      .paginate({ numItems: 100, cursor: cursor ?? null });
    for (const space of page.page) {
      if (space.autonomyPaused) continue;
      await buildReport(ctx, space, "daily");
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.reports.generateAllDaily, {
        cursor: page.continueCursor,
      });
    }
  },
});
