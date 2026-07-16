import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";

export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("artifacts")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(100);
    // Resolve download URLs for stored files.
    return await Promise.all(
      rows.map(async (a) => ({
        ...a,
        downloadUrl: a.storageId ? await ctx.storage.getUrl(a.storageId) : a.url ?? null,
      })),
    );
  },
});

/** Upload URL for a file artifact (client PUTs the file, then calls createFile). */
export const generateUploadUrl = mutation({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    kind: v.union(v.literal("file"), v.literal("text"), v.literal("link")),
    text: v.optional(v.string()),
    url: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    mime: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    agentId: v.optional(v.id("agents")),
    threadId: v.optional(v.id("threads")),
  },
  handler: async (ctx, { spaceId, ...rest }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    return await ctx.db.insert("artifacts", {
      companyId: scope.companyId,
      spaceId,
      ...rest,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), artifactId: v.id("artifacts") },
  handler: async (ctx, { spaceId, artifactId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const a = await ctx.db.get(artifactId);
    if (!a || a.spaceId !== spaceId) throw new Error("Not found");
    if (a.storageId) await ctx.storage.delete(a.storageId);
    await ctx.db.delete(artifactId);
  },
});

/** Agents submit deliverables via the connector (token-authenticated). */
export const addFromConnector = internalMutation({
  args: {
    companyId: v.string(),
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    name: v.string(),
    kind: v.union(v.literal("text"), v.literal("link")),
    text: v.optional(v.string()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("artifacts", { ...args, createdAt: Date.now() });
  },
});
