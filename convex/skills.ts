import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { embed } from "./embeddings";

export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("skills")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
  },
});

export const create = action({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Id<"skills">> => {
    const embedding = await embed(`${args.name}\n\n${args.content}`);
    return await ctx.runMutation(internal.skills.insert, {
      ...args,
      embedding: embedding ?? undefined,
    });
  },
});

export const update = action({
  args: {
    spaceId: v.id("spaces"),
    skillId: v.id("skills"),
    name: v.string(),
    description: v.optional(v.string()),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<void> => {
    const embedding = await embed(`${args.name}\n\n${args.content}`);
    await ctx.runMutation(internal.skills.patch, {
      ...args,
      embedding: embedding ?? undefined,
    });
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), skillId: v.id("skills") },
  handler: async (ctx, { spaceId, skillId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const skill = await ctx.db.get(skillId);
    if (!skill || skill.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(skillId);
  },
});

export const search = action({
  args: {
    spaceId: v.id("spaces"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { spaceId, query: queryText, limit }): Promise<Doc<"skills">[]> => {
    const vector = await embed(queryText);
    if (!vector) {
      return await ctx.runQuery(internal.skills.textSearch, {
        spaceId,
        query: queryText,
        limit: limit ?? 10,
      });
    }
    const results = await ctx.vectorSearch("skills", "by_embedding", {
      vector,
      limit: limit ?? 10,
      filter: (q) => q.eq("spaceId", spaceId),
    });
    const ids = results.map((r) => r._id);
    const docs: (Doc<"skills"> | null)[] = await ctx.runQuery(
      internal.skills.byIds,
      { spaceId, ids },
    );
    const score = new Map<string, number>(
      results.map((r: { _id: string; _score: number }) => [r._id, r._score]),
    );
    return docs
      .filter((d): d is Doc<"skills"> => d !== null)
      .sort(
        (a: Doc<"skills">, b: Doc<"skills">) =>
          (score.get(b._id) ?? 0) - (score.get(a._id) ?? 0),
      );
  },
});

// --- internal ----------------------------------------------------------------

export const insert = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, { spaceId, ...rest }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const now = Date.now();
    return await ctx.db.insert("skills", {
      companyId: scope.companyId,
      spaceId,
      ...rest,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const patch = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    skillId: v.id("skills"),
    name: v.string(),
    description: v.optional(v.string()),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, { spaceId, skillId, ...rest }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const skill = await ctx.db.get(skillId);
    if (!skill || skill.spaceId !== scope.spaceId) throw new Error("Not found");
    await ctx.db.patch(skillId, { ...rest, updatedAt: Date.now() });
  },
});

export const byIds = internalQuery({
  args: { spaceId: v.id("spaces"), ids: v.array(v.id("skills")) },
  handler: async (ctx, { ids }) => {
    return await Promise.all(ids.map((id) => ctx.db.get(id)));
  },
});

export const textSearch = internalQuery({
  args: { spaceId: v.id("spaces"), query: v.string(), limit: v.number() },
  handler: async (ctx, { spaceId, query, limit }) => {
    const needle = query.toLowerCase();
    const rows = await ctx.db
      .query("skills")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
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
