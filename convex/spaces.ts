import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { companyOf, resolveScope, requireRole } from "./lib/auth";
import {
  roleValidator,
  guardConfigValidator,
  DEFAULT_GUARD_CONFIG,
} from "./schema";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "space"
  );
}

/** Spaces the caller can see, with their role in each (for the switcher). */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const { userId, companyId } = await companyOf(ctx);
    const spaces = await ctx.db
      .query("spaces")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const out = [];
    for (const space of spaces) {
      const member = await ctx.db
        .query("spaceMembers")
        .withIndex("by_space_user", (q) =>
          q.eq("spaceId", space._id).eq("userId", userId),
        )
        .unique();
      const role = member?.role ?? (space.createdBy === userId ? "owner" : null);
      if (role) {
        out.push({
          _id: space._id,
          name: space.name,
          slug: space.slug,
          role,
          autonomyPaused: space.autonomyPaused ?? false,
          shadowMode: space.shadowMode ?? false,
        });
      }
    }
    return out;
  },
});

export const get = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    return {
      ...scope.space,
      role: scope.role,
      guardConfig: scope.space.guardConfig ?? DEFAULT_GUARD_CONFIG,
    };
  },
});

/** Create a Space and make the caller its owner. */
export const create = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, { name, description }) => {
    const { userId, companyId } = await companyOf(ctx);
    const spaceId = await ctx.db.insert("spaces", {
      companyId,
      name,
      slug: slugify(name),
      description,
      createdBy: userId,
      autonomyPaused: false,
      guardConfig: DEFAULT_GUARD_CONFIG,
      createdAt: Date.now(),
    });
    await ctx.db.insert("spaceMembers", {
      companyId,
      spaceId,
      userId,
      role: "owner",
      createdAt: Date.now(),
    });
    return spaceId;
  },
});

/**
 * Ensure the caller has at least one Space. Called on first dashboard load so
 * a brand-new Company immediately has a working "Default" Space.
 */
export const ensureDefault = mutation({
  args: {},
  handler: async (ctx): Promise<Id<"spaces">> => {
    const { userId, companyId } = await companyOf(ctx);
    const existing = await ctx.db
      .query("spaces")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .first();
    if (existing) {
      // Make sure the creator has a membership row (idempotent).
      const member = await ctx.db
        .query("spaceMembers")
        .withIndex("by_space_user", (q) =>
          q.eq("spaceId", existing._id).eq("userId", userId),
        )
        .unique();
      if (!member && existing.createdBy === userId) {
        await ctx.db.insert("spaceMembers", {
          companyId,
          spaceId: existing._id,
          userId,
          role: "owner",
          createdAt: Date.now(),
        });
      }
      return existing._id;
    }
    const spaceId = await ctx.db.insert("spaces", {
      companyId,
      name: "Default",
      slug: "default",
      createdBy: userId,
      autonomyPaused: false,
      guardConfig: DEFAULT_GUARD_CONFIG,
      createdAt: Date.now(),
    });
    await ctx.db.insert("spaceMembers", {
      companyId,
      spaceId,
      userId,
      role: "owner",
      createdAt: Date.now(),
    });
    return spaceId;
  },
});

export const update = mutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { spaceId, ...patch }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, val]) => val !== undefined),
    );
    await ctx.db.patch(spaceId, clean);
  },
});

export const setGuardConfig = mutation({
  args: { spaceId: v.id("spaces"), guardConfig: guardConfigValidator },
  handler: async (ctx, { spaceId, guardConfig }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    await ctx.db.patch(spaceId, { guardConfig });
  },
});

/** The kill switch: pause/resume all autonomous dispatch in a Space. */
export const setAutonomyPaused = mutation({
  args: { spaceId: v.id("spaces"), paused: v.boolean() },
  handler: async (ctx, { spaceId, paused }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    await ctx.db.patch(spaceId, { autonomyPaused: paused });
    await ctx.db.insert("workEvents", {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "governance",
      action: paused ? "autonomy_paused" : "autonomy_resumed",
      summary: paused
        ? "Kill switch engaged — autonomous dispatch halted"
        : "Autonomy resumed",
      createdAt: Date.now(),
    });
  },
});

/** Shadow mode: agents propose actions to the ledger instead of executing them. */
export const setShadowMode = mutation({
  args: { spaceId: v.id("spaces"), shadow: v.boolean() },
  handler: async (ctx, { spaceId, shadow }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    await ctx.db.patch(spaceId, { shadowMode: shadow });
    await ctx.db.insert("workEvents", {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "governance",
      action: shadow ? "shadow_enabled" : "shadow_disabled",
      summary: shadow
        ? "Shadow mode enabled — agents propose actions instead of executing"
        : "Shadow mode disabled — agents execute actions normally",
      createdAt: Date.now(),
    });
  },
});

// --- members & roles --------------------------------------------------------

export const members = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("spaceMembers")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
  },
});

export const addMember = mutation({
  args: {
    spaceId: v.id("spaces"),
    userId: v.string(),
    role: roleValidator,
  },
  handler: async (ctx, { spaceId, userId, role }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const existing = await ctx.db
      .query("spaceMembers")
      .withIndex("by_space_user", (q) =>
        q.eq("spaceId", spaceId).eq("userId", userId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { role });
      return existing._id;
    }
    return await ctx.db.insert("spaceMembers", {
      companyId: scope.companyId,
      spaceId,
      userId,
      role,
      createdAt: Date.now(),
    });
  },
});

export const setMemberRole = mutation({
  args: {
    spaceId: v.id("spaces"),
    memberId: v.id("spaceMembers"),
    role: roleValidator,
  },
  handler: async (ctx, { spaceId, memberId, role }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const member = await ctx.db.get(memberId);
    if (!member || member.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(memberId, { role });
  },
});

export const removeMember = mutation({
  args: { spaceId: v.id("spaces"), memberId: v.id("spaceMembers") },
  handler: async (ctx, { spaceId, memberId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const member = await ctx.db.get(memberId);
    if (!member || member.spaceId !== spaceId) throw new Error("Not found");
    // Don't allow removing the last owner.
    if (member.role === "owner") {
      const owners = (
        await ctx.db
          .query("spaceMembers")
          .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
          .collect()
      ).filter((m) => m.role === "owner");
      if (owners.length <= 1) throw new Error("Cannot remove the last owner");
    }
    await ctx.db.delete(memberId);
  },
});
