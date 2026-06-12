import { v } from "convex/values";
import {
  query,
  action,
  internalAction,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { embed } from "./embeddings";

const SCOPE = v.union(v.literal("space"), v.literal("company"));

/** List memories visible in a Space: its own + company-wide. */
export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    const own = await ctx.db
      .query("memories")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
    const company = await ctx.db
      .query("memories")
      .withIndex("by_company", (q) => q.eq("companyId", scope.companyId))
      .order("desc")
      .collect();
    // Company-wide memories from OTHER spaces (own already included above).
    const extra = company.filter(
      (m) => m.scope === "company" && m.spaceId !== spaceId,
    );
    return [...own, ...extra].sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const add = action({
  args: {
    spaceId: v.id("spaces"),
    title: v.string(),
    content: v.string(),
    scope: v.optional(SCOPE),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Id<"memories">> => {
    const embedding = await embed(`${args.title}\n\n${args.content}`);
    return await ctx.runMutation(internal.memories.insert, {
      ...args,
      embedding: embedding ?? undefined,
    });
  },
});

export const insert = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    title: v.string(),
    content: v.string(),
    scope: v.optional(SCOPE),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, { spaceId, scope, source, ...rest }) => {
    const s = await resolveScope(ctx, spaceId);
    requireRole(s, "operator");
    return await ctx.db.insert("memories", {
      companyId: s.companyId,
      spaceId,
      scope: scope ?? "space",
      source: source ?? "manual",
      ...rest,
      createdAt: Date.now(),
    });
  },
});

export const remove = action({
  args: { spaceId: v.id("spaces"), memoryId: v.id("memories") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runMutation(internal.memories.doRemove, args);
  },
});

export const doRemove = internalMutation({
  args: { spaceId: v.id("spaces"), memoryId: v.id("memories") },
  handler: async (ctx, { spaceId, memoryId }) => {
    const s = await resolveScope(ctx, spaceId);
    requireRole(s, "operator");
    const m = await ctx.db.get(memoryId);
    if (!m || m.companyId !== s.companyId) throw new Error("Not found");
    await ctx.db.delete(memoryId);
  },
});

// ---------------------------------------------------------------------------
// Retrieval (RAG) — semantic search over space + company-wide memory.
// ---------------------------------------------------------------------------

export const companyForSpace = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }): Promise<{ companyId: string }> => {
    const s = await resolveScope(ctx, spaceId);
    return { companyId: s.companyId };
  },
});

export const byIds = internalQuery({
  args: { ids: v.array(v.id("memories")) },
  handler: async (ctx, { ids }) => {
    return await Promise.all(ids.map((id) => ctx.db.get(id)));
  },
});

/** Core retrieval shared by the dashboard and the connector context API. */
async function retrieve(
  ctx: { vectorSearch: any; runQuery: any },
  spaceId: Id<"spaces">,
  companyId: string,
  queryText: string,
  limit: number,
): Promise<Doc<"memories">[]> {
  const vector = await embed(queryText);
  if (!vector) return [];
  // Filter to the company (isolation), then keep this Space's own + company-wide.
  const results = await ctx.vectorSearch("memories", "by_embedding", {
    vector,
    limit: limit * 4,
    filter: (q: any) => q.eq("companyId", companyId),
  });
  const score = new Map<string, number>(
    results.map((r: { _id: string; _score: number }) => [r._id, r._score]),
  );
  const docs = await ctx.runQuery(internal.memories.byIds, {
    ids: results.map((r: { _id: Id<"memories"> }) => r._id),
  });
  return docs
    .filter(
      (d: any) =>
        d && (d.spaceId === spaceId || d.scope === "company"),
    )
    .sort((a: any, b: any) => (score.get(b._id) ?? 0) - (score.get(a._id) ?? 0))
    .slice(0, limit);
}

export const search = action({
  args: {
    spaceId: v.id("spaces"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { spaceId, query, limit }): Promise<Doc<"memories">[]> => {
    const { companyId } = await ctx.runQuery(
      internal.memories.companyForSpace,
      { spaceId },
    );
    return await retrieve(ctx, spaceId, companyId, query, limit ?? 8);
  },
});

/** Connector/agent-facing retrieval (no user identity; scope from the agent). */
export const retrieveForConnector = internalAction({
  args: {
    spaceId: v.id("spaces"),
    companyId: v.string(),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { spaceId, companyId, query, limit }): Promise<Doc<"memories">[]> => {
    return await retrieve(ctx, spaceId, companyId, query, limit ?? 8);
  },
});

// ---------------------------------------------------------------------------
// Ingestion — turn a thread's conversation into reusable memory.
// ---------------------------------------------------------------------------

export const threadText = internalQuery({
  args: { spaceId: v.id("spaces"), threadId: v.id("threads") },
  handler: async (ctx, { spaceId, threadId }) => {
    const s = await resolveScope(ctx, spaceId);
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.spaceId !== spaceId) return null;
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("asc")
      .take(50);
    return {
      companyId: s.companyId,
      title: thread.title,
      text: msgs.map((m) => `${m.role}: ${m.content}`).join("\n"),
    };
  },
});

export const ingestThread = action({
  args: { spaceId: v.id("spaces"), threadId: v.id("threads") },
  handler: async (ctx, { spaceId, threadId }): Promise<Id<"memories"> | null> => {
    const data = await ctx.runQuery(internal.memories.threadText, {
      spaceId,
      threadId,
    });
    if (!data || !data.text.trim()) return null;
    const content = data.text.slice(0, 6000);
    const embedding = await embed(`${data.title}\n\n${content}`);
    return await ctx.runMutation(internal.memories.insert, {
      spaceId,
      title: `Thread: ${data.title}`,
      content,
      scope: "space",
      source: "thread",
      embedding: embedding ?? undefined,
    });
  },
});
