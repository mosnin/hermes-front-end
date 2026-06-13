import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveScope, requireRole } from "./lib/auth";
import { generateToken, sha256Hex } from "./lib/crypto";

/**
 * Mint an API key for the control plane. Runs as an action to generate + hash
 * the key with Web Crypto. Returns the raw key ONCE — it is never stored.
 */
export const create = action({
  args: { spaceId: v.id("spaces"), name: v.string() },
  handler: async (ctx, args): Promise<{ id: string; key: string }> => {
    const key = `hk_${generateToken()}`;
    const keyHash = await sha256Hex(key);
    const prefix = key.slice(0, 11);
    const id: string = await ctx.runMutation(internal.apiKeys.insert, {
      spaceId: args.spaceId,
      name: args.name,
      keyHash,
      prefix,
    });
    return { id, key };
  },
});

export const insert = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    keyHash: v.string(),
    prefix: v.string(),
  },
  handler: async (ctx, { spaceId, name, keyHash, prefix }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    return await ctx.db.insert("apiKeys", {
      companyId: scope.companyId,
      spaceId,
      name,
      keyHash,
      prefix,
      createdBy: scope.userId,
      revoked: false,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
    // Never expose the key hash to the client.
    return rows.map((r) => ({
      _id: r._id,
      name: r.name,
      prefix: r.prefix,
      revoked: r.revoked,
      lastUsedAt: r.lastUsedAt,
      createdAt: r.createdAt,
    }));
  },
});

export const revoke = mutation({
  args: { spaceId: v.id("spaces"), keyId: v.id("apiKeys") },
  handler: async (ctx, { spaceId, keyId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const row = await ctx.db.get(keyId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(keyId, { revoked: true });
  },
});

/** Look up a key by its hash for API auth (token-authenticated, no user identity). */
export const byHash = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, { keyHash }) => {
    return await ctx.db
      .query("apiKeys")
      .withIndex("by_hash", (q) => q.eq("keyHash", keyHash))
      .unique();
  },
});
