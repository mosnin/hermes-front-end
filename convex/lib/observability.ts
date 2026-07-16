import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Structured error capture. Autonomous systems fail silently unless failures
 * are recorded somewhere queryable — this writes one row per failure with a
 * trace id that ties together the connector → HTTP → workflow hops of a single
 * request. Never throws (observability must not create new failures).
 */

/** Deterministic-safe trace id (no Math.random, which Convex forbids). */
export function newTraceId(seed?: string): string {
  const base = `${Date.now().toString(36)}${seed ?? ""}`;
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `t_${Date.now().toString(36)}${(h >>> 0).toString(36)}`;
}

export async function recordError(
  ctx: MutationCtx,
  args: {
    companyId: string;
    spaceId?: Id<"spaces">;
    traceId?: string;
    source: string;
    agentId?: Id<"agents">;
    kind: string;
    message: string;
    detail?: string;
  },
): Promise<string> {
  const traceId = args.traceId ?? newTraceId(args.source);
  try {
    await ctx.db.insert("errors", {
      companyId: args.companyId,
      spaceId: args.spaceId,
      traceId,
      source: args.source,
      agentId: args.agentId,
      kind: args.kind,
      message: args.message.slice(0, 500),
      detail: args.detail?.slice(0, 2000),
      createdAt: Date.now(),
    });
  } catch {
    // Swallow — capturing an error must never raise a new one.
  }
  return traceId;
}
