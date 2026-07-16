import { v } from "convex/values";
import { query, action } from "./_generated/server";
import { api } from "./_generated/api";
import { resolveScope, requireRole } from "./lib/auth";
import { assertFeature } from "./lib/plans";
import { buildChain } from "./lib/auditChain";

/** Export the immutable work record for a Space (admin+) — JSON download. */
export const export_ = query({
  args: { spaceId: v.id("spaces"), sinceDays: v.optional(v.number()) },
  handler: async (ctx, { spaceId, sinceDays }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    assertFeature(scope, "audit_export"); // enterprise entitlement
    const since = Date.now() - (sinceDays ?? 30) * 86_400_000;
    const rows = await ctx.db
      .query("workEvents")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", since),
      )
      .order("desc")
      .take(5000);
    return rows.map((e) => ({
      at: new Date(e.createdAt).toISOString(),
      actorType: e.actorType,
      actorId: e.actorId ?? null,
      agentId: e.agentId ?? null,
      category: e.category,
      action: e.action,
      summary: e.summary,
    }));
  },
});

type ExportedEvent = {
  at: string;
  actorType: string;
  actorId: string | null;
  agentId: string | null;
  category: string;
  action: string;
  summary: string;
};

/**
 * Tamper-evident (WORM-style) audit export. Each entry is hash-chained to its
 * predecessor and the export carries the chain head — record the head
 * out-of-band and any later edit, deletion, or reordering of the exported log
 * is detectable by re-running the (documented, offline) verification. Gated by
 * the enterprise audit_export feature like the plain export.
 */
type SignedExport = {
  format: string;
  algorithm: string;
  genesis: string;
  head: string;
  count: number;
  entries: { entry: ExportedEvent; hash: string }[];
};

export const exportSigned = action({
  args: { spaceId: v.id("spaces"), sinceDays: v.optional(v.number()) },
  // Explicit return type: this handler references api.audit.export_ from its
  // own module, which without an annotation creates the self-referential
  // inference cycle (TS7022) that resolves the whole module to `any`.
  handler: async (ctx, { spaceId, sinceDays }): Promise<SignedExport> => {
    // Reuses the plain export query — auth, role, and plan gates included.
    const events: ExportedEvent[] = await ctx.runQuery(api.audit.export_, {
      spaceId,
      sinceDays,
    });
    const genesis = `hermes-audit:${spaceId}`;
    const { chained, head } = await buildChain(events, genesis);
    return {
      format: "hermes-audit-chain-v1",
      algorithm: "SHA-256(prevHash | canonicalJSON(entry))",
      genesis,
      head,
      count: chained.length,
      entries: chained,
    };
  },
});

/** Browse the immutable work record for a Space (admin+). */
export const list = query({
  args: {
    spaceId: v.id("spaces"),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { spaceId, category, limit }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const rows = await ctx.db
      .query("workEvents")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(limit ?? 500);
    return category ? rows.filter((e) => e.category === category) : rows;
  },
});
