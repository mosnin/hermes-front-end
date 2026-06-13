import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";

/** List secrets in a Space (admins only). The raw `value` is NEVER returned. */
export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const rows = await ctx.db
      .query("secrets")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      name: r.name,
      preview: r.preview,
      createdBy: r.createdBy,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
    }));
  },
});

/** Create or update a secret by (spaceId, name). Admins only. */
export const set = mutation({
  args: { spaceId: v.id("spaces"), name: v.string(), value: v.string() },
  handler: async (ctx, { spaceId, name, value }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const preview =
      value.length <= 8 ? "••••" : value.slice(0, 3) + "••••" + value.slice(-2);
    const now = Date.now();
    const existing = await ctx.db
      .query("secrets")
      .withIndex("by_space_name", (q) =>
        q.eq("spaceId", spaceId).eq("name", name),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value, preview, updatedAt: now });
    } else {
      await ctx.db.insert("secrets", {
        companyId: scope.companyId,
        spaceId,
        name,
        value,
        preview,
        createdBy: scope.userId,
        updatedAt: now,
        createdAt: now,
      });
    }
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "governance",
      action: "secret_set",
      summary: `Set secret ${name}`,
    });
  },
});

/** Delete a secret. Admins only. */
export const remove = mutation({
  args: { spaceId: v.id("spaces"), secretId: v.id("secrets") },
  handler: async (ctx, { spaceId, secretId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const row = await ctx.db.get(secretId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(secretId);
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "governance",
      action: "secret_removed",
      summary: `Removed secret ${row.name}`,
    });
  },
});

/** Reveal the raw value of a secret (admin reveal). Admins only. */
export const reveal = query({
  args: { spaceId: v.id("spaces"), secretId: v.id("secrets") },
  handler: async (ctx, { spaceId, secretId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const row = await ctx.db.get(secretId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    return { value: row.value };
  },
});

// --- connector injection (token-authenticated, no user identity) -------------
//
// The two queries below are internal-only — they are never client-callable and
// carry no role/identity check. They are invoked from the connector secrets
// HTTP endpoint, where the agent is already authenticated by its connector
// token (the endpoint resolves the agent and passes `agent.spaceId`). The raw
// secret value IS returned here so the orchestrator can inject it into the
// agent's environment, letting the agent use credentials (e.g. an API key for a
// tool) without the dashboard ever exposing the value.

/** All of a Space's secrets as `{ name, value }` pairs for env injection. */
export const getForConnector = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const rows = await ctx.db
      .query("secrets")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return rows.map((r) => ({ name: r.name, value: r.value }));
  },
});

/** A single Space secret's value by name, or null if not set. */
export const getOneForConnector = internalQuery({
  args: { spaceId: v.id("spaces"), name: v.string() },
  handler: async (ctx, { spaceId, name }) => {
    const row = await ctx.db
      .query("secrets")
      .withIndex("by_space_name", (q) =>
        q.eq("spaceId", spaceId).eq("name", name),
      )
      .unique();
    return row ? { value: row.value } : null;
  },
});
