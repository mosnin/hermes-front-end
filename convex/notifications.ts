import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";

/** Recent notifications for a Space (reactive), newest first. */
export const list = query({
  args: { spaceId: v.id("spaces"), limit: v.optional(v.number()) },
  handler: async (ctx, { spaceId, limit }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("notifications")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(limit ?? 50);
  },
});

/** Number of unread notifications in a Space. */
export const unreadCount = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_space_read", (q) =>
        q.eq("spaceId", spaceId).eq("read", false),
      )
      .collect();
    return unread.length;
  },
});

/** Mark a single notification as read. */
export const markRead = mutation({
  args: { spaceId: v.id("spaces"), notificationId: v.id("notifications") },
  handler: async (ctx, { spaceId, notificationId }) => {
    await resolveScope(ctx, spaceId);
    const notification = await ctx.db.get(notificationId);
    if (!notification || notification.spaceId !== spaceId) {
      throw new Error("Notification not found");
    }
    await ctx.db.patch(notificationId, { read: true });
  },
});

/** Mark every unread notification in a Space as read (operator+). */
export const markAllRead = mutation({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_space_read", (q) =>
        q.eq("spaceId", spaceId).eq("read", false),
      )
      .collect();
    for (const n of unread) {
      await ctx.db.patch(n._id, { read: true });
    }
  },
});

/** Push a new notification into a Space. Exported for future internal use. */
export const push = internalMutation({
  args: {
    companyId: v.string(),
    spaceId: v.id("spaces"),
    type: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    href: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      ...args,
      read: false,
      createdAt: Date.now(),
    });
  },
});
