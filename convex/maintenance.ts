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
/**
 * Retention sweep for tables that would otherwise grow without bound:
 *   - idempotencyKeys: only meaningful within a retry window; kept 7 days.
 *   - errors:          structured error stream; kept 30 days.
 *   - streamChunks:    finalizeStream deletes completed streams, but a stream
 *                      abandoned mid-flight (agent crash before done=true)
 *                      leaks its chunks forever; kept 1 day.
 * Each pass is bounded (.take) so the hourly tick is O(batch) — leftovers are
 * picked up next hour.
 */
export const sweepRetention = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const POLICIES = [
      { table: "idempotencyKeys", keepMs: 7 * DAY },
      { table: "errors", keepMs: 30 * DAY },
      { table: "streamChunks", keepMs: 1 * DAY },
    ] as const;

    const deleted: Record<string, number> = {};
    for (const p of POLICIES) {
      const stale = await ctx.db
        .query(p.table)
        .withIndex("by_time", (q) => q.lt("createdAt", now - p.keepMs))
        .take(500);
      for (const row of stale) await ctx.db.delete(row._id);
      deleted[p.table] = stale.length;
    }
    return deleted;
  },
});

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
