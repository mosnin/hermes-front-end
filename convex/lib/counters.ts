import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * O(1) aggregate counters.
 *
 * Metering and the autonomy guards used to `.collect()` a growing time window
 * on every event — O(n) per event, O(n²) across a window. That was the single
 * worst scaling/cost bug in the platform. Instead we keep one accumulator row
 * per (space, scope, bucket) and patch it in place: a read and a write, both
 * O(1), regardless of how many events the Space has produced.
 */

export type CounterValue = { count: number; valueUsd: number };

export async function readCounter(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
  scope: string,
  bucket: string,
): Promise<CounterValue> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_space_scope_bucket", (q) =>
      q.eq("spaceId", spaceId).eq("scope", scope).eq("bucket", bucket),
    )
    .unique();
  return { count: row?.count ?? 0, valueUsd: row?.valueUsd ?? 0 };
}

/** Read-only counter lookup usable from a query context (no writes). */
export async function readCounterQuery(
  ctx: QueryCtx | MutationCtx,
  spaceId: Id<"spaces">,
  scope: string,
  bucket: string,
): Promise<CounterValue> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_space_scope_bucket", (q) =>
      q.eq("spaceId", spaceId).eq("scope", scope).eq("bucket", bucket),
    )
    .unique();
  return { count: row?.count ?? 0, valueUsd: row?.valueUsd ?? 0 };
}

export async function bumpCounter(
  ctx: MutationCtx,
  args: {
    companyId: string;
    spaceId: Id<"spaces">;
    scope: string;
    bucket: string;
    count?: number;
    valueUsd?: number;
  },
): Promise<CounterValue> {
  const { companyId, spaceId, scope, bucket } = args;
  const incCount = args.count ?? 1;
  const incUsd = args.valueUsd ?? 0;
  const row = await ctx.db
    .query("counters")
    .withIndex("by_space_scope_bucket", (q) =>
      q.eq("spaceId", spaceId).eq("scope", scope).eq("bucket", bucket),
    )
    .unique();
  if (row) {
    const count = row.count + incCount;
    const valueUsd = (row.valueUsd ?? 0) + incUsd;
    await ctx.db.patch(row._id, { count, valueUsd, updatedAt: Date.now() });
    return { count, valueUsd };
  }
  await ctx.db.insert("counters", {
    companyId,
    spaceId,
    scope,
    bucket,
    count: incCount,
    valueUsd: incUsd,
    updatedAt: Date.now(),
  });
  return { count: incCount, valueUsd: incUsd };
}

// -- bucket key helpers -------------------------------------------------------

/** UTC month, e.g. "2026-07" — the monthly spend accounting window. */
export function monthBucket(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Minute since epoch — the per-minute rate-limit window (fixed window). */
export function minuteBucket(now: number = Date.now()): string {
  return String(Math.floor(now / 60_000));
}

/** Day since epoch — the daily message-budget window. */
export function dayBucket(now: number = Date.now()): string {
  return String(Math.floor(now / 86_400_000));
}

/**
 * Stable FNV-1a hash for loop-detection keys, normalized so trivial
 * case/whitespace differences still count as "the same message".
 */
export function loopHash(
  from: Id<"agents">,
  to: Id<"agents">,
  content: string,
): string {
  const norm = content.trim().toLowerCase().slice(0, 200);
  const s = `${from}|${to}|${norm}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
