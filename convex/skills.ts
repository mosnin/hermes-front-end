import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { getOwnerId } from "./lib/auth";
import { embed } from "./embeddings";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getOwnerId(ctx);
    return await ctx.db
      .query("skills")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
  },
});

/** Create a skill, embedding its content for semantic search when possible. */
export const create = action({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Id<"skills">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const ownerId =
      (identity as { org_id?: string }).org_id ?? identity.subject;
    const embedding = await embed(`${args.name}\n\n${args.content}`);
    return await ctx.runMutation(internal.skills.insert, {
      ownerId,
      ...args,
      embedding: embedding ?? undefined,
    });
  },
});

export const update = action({
  args: {
    skillId: v.id("skills"),
    name: v.string(),
    description: v.optional(v.string()),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { skillId, ...args }): Promise<void> => {
    const embedding = await embed(`${args.name}\n\n${args.content}`);
    await ctx.runMutation(internal.skills.patch, {
      skillId,
      ...args,
      embedding: embedding ?? undefined,
    });
  },
});

export const remove = mutation({
  args: { skillId: v.id("skills") },
  handler: async (ctx, { skillId }) => {
    const ownerId = await getOwnerId(ctx);
    const skill = await ctx.db.get(skillId);
    if (!skill || skill.ownerId !== ownerId) throw new Error("Not found");
    await ctx.db.delete(skillId);
  },
});

/**
 * Semantic search over skills via Convex vector search. Falls back to a simple
 * case-insensitive substring match when embeddings aren't configured.
 */
export const search = action({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { query: queryText, limit }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const ownerId =
      (identity as { org_id?: string }).org_id ?? identity.subject;

    const vector = await embed(queryText);
    if (!vector) {
      // No embeddings available — fall back to text search.
      return await ctx.runQuery(internal.skills.textSearch, {
        ownerId,
        query: queryText,
        limit: limit ?? 10,
      });
    }

    const results = await ctx.vectorSearch("skills", "by_embedding", {
      vector,
      limit: limit ?? 10,
      filter: (q) => q.eq("ownerId", ownerId),
    });
    const ids = results.map((r) => r._id);
    const docs = await ctx.runQuery(internal.skills.byIds, { ids });
    // Preserve vector-search relevance order.
    const score = new Map<string, number>(
      results.map((r: { _id: string; _score: number }) => [r._id, r._score]),
    );
    return docs
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort(
        (a, b) => (score.get(b._id) ?? 0) - (score.get(a._id) ?? 0),
      );
  },
});

// --- internal ----------------------------------------------------------------

export const insert = internalMutation({
  args: {
    ownerId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("skills", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const patch = internalMutation({
  args: {
    skillId: v.id("skills"),
    name: v.string(),
    description: v.optional(v.string()),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, { skillId, ...patch }) => {
    await ctx.db.patch(skillId, { ...patch, updatedAt: Date.now() });
  },
});

export const byIds = internalQuery({
  args: { ids: v.array(v.id("skills")) },
  handler: async (ctx, { ids }) => {
    return await Promise.all(ids.map((id) => ctx.db.get(id)));
  },
});

export const textSearch = internalQuery({
  args: { ownerId: v.string(), query: v.string(), limit: v.number() },
  handler: async (ctx, { ownerId, query, limit }) => {
    const needle = query.toLowerCase();
    const rows = await ctx.db
      .query("skills")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    return rows
      .filter(
        (s) =>
          s.name.toLowerCase().includes(needle) ||
          s.content.toLowerCase().includes(needle) ||
          (s.description ?? "").toLowerCase().includes(needle),
      )
      .slice(0, limit);
  },
});
