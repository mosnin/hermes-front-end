import { internalMutation } from "./_generated/server";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Sweep expired aggregate counters. Minute/day/loop buckets are only ever read
 * inside their own short window, so once they've gone stale they're dead weight;
 * monthly "usage" accumulators are read all month, so we keep them longer.
 *
 * Bounded per tick (paginated by the by_updated index) so the sweep itself
 * stays O(batch), never scanning the whole table.
 */
export const sweepCounters = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const shortCutoff = now - 2 * DAY; // a2a:min / a2a:day / loop
    const longCutoff = now - 40 * DAY; // usage (past-month accumulators)

    // Oldest-first scan, capped so a busy deployment can't stall the tick.
    const stale = await ctx.db
      .query("counters")
      .withIndex("by_updated", (q) => q.lt("updatedAt", shortCutoff))
      .take(500);

    let deleted = 0;
    for (const row of stale) {
      const cutoff = row.scope === "usage" ? longCutoff : shortCutoff;
      if (row.updatedAt < cutoff) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    return { scanned: stale.length, deleted };
  },
});
