import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveScope, requireRole } from "./lib/auth";
import { hmacSha256Hex } from "./lib/crypto";

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

// ===========================================================================
// Delivery channel preferences (feature 19) — per user × space, driving
// email + webhook fan-out for approvals (and other categories over time).
// ===========================================================================

const DEFAULT_CATEGORIES = ["approval"];

/** The caller's own delivery prefs for a Space (creates none — a null read
 * means "using defaults": in-app only). */
export const getPrefs = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    const row = await ctx.db
      .query("notificationPrefs")
      .withIndex("by_space_user", (q) =>
        q.eq("spaceId", spaceId).eq("userId", scope.userId),
      )
      .unique();
    if (!row) return null;
    // Never expose the secret name is fine (it's just a vault key, not the
    // secret itself), but never expose anything beyond that shape.
    return {
      _id: row._id,
      emailEnabled: row.emailEnabled ?? false,
      emailAddress: row.emailAddress,
      webhookEnabled: row.webhookEnabled ?? false,
      webhookUrl: row.webhookUrl,
      hasWebhookSecret: !!row.webhookSecretRef,
      categories: row.categories ?? DEFAULT_CATEGORIES,
    };
  },
});

/**
 * Upsert the caller's own delivery prefs. Every member manages their own
 * channels — no elevated role required, this only ever touches the caller's
 * row (enforced by keying on scope.userId, never a passed-in userId).
 *
 * `webhookSecret`, if provided, is stored in the Space secrets vault (never
 * inline on the prefs row) under a per-user name so the HMAC key never
 * appears in a client-readable query result.
 */
export const setPrefs = mutation({
  args: {
    spaceId: v.id("spaces"),
    emailEnabled: v.optional(v.boolean()),
    emailAddress: v.optional(v.string()),
    webhookEnabled: v.optional(v.boolean()),
    webhookUrl: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
    categories: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { spaceId, webhookSecret, ...rest }) => {
    const scope = await resolveScope(ctx, spaceId);
    if (rest.webhookUrl) {
      try {
        const u = new URL(rest.webhookUrl);
        if (u.protocol !== "https:") {
          throw new Error("Webhook URL must use https://");
        }
      } catch {
        throw new Error("Invalid webhook URL");
      }
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("notificationPrefs")
      .withIndex("by_space_user", (q) =>
        q.eq("spaceId", spaceId).eq("userId", scope.userId),
      )
      .unique();

    let webhookSecretRef = existing?.webhookSecretRef;
    if (webhookSecret) {
      webhookSecretRef = `notif_webhook_${scope.userId}`;
      const existingSecret = await ctx.db
        .query("secrets")
        .withIndex("by_space_name", (q) =>
          q.eq("spaceId", spaceId).eq("name", webhookSecretRef!),
        )
        .unique();
      if (existingSecret) {
        await ctx.db.patch(existingSecret._id, {
          value: webhookSecret,
          preview: "••••",
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("secrets", {
          companyId: scope.companyId,
          spaceId,
          name: webhookSecretRef,
          value: webhookSecret,
          preview: "••••",
          createdBy: scope.userId,
          updatedAt: now,
          createdAt: now,
        });
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, { ...rest, webhookSecretRef, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("notificationPrefs", {
      companyId: scope.companyId,
      spaceId,
      userId: scope.userId,
      webhookSecretRef,
      ...rest,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** All prefs in a Space matching a category, for fan-out delivery. */
export const prefsForCategory = internalQuery({
  args: { spaceId: v.id("spaces"), category: v.string() },
  handler: async (ctx, { spaceId, category }) => {
    const rows = await ctx.db
      .query("notificationPrefs")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return rows.filter((r) => (r.categories ?? DEFAULT_CATEGORIES).includes(category));
  },
});

// ===========================================================================
// Pluggable email provider (stub). Swaps to a real provider (Resend/SES/etc)
// by setting EMAIL_PROVIDER_API_KEY + EMAIL_PROVIDER_URL; with neither set it
// safely no-ops and records the attempt for observability instead of failing
// the caller (delivery is best-effort, in-app notification is authoritative).
// ===========================================================================

async function sendEmailViaProvider(args: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: boolean; detail?: string }> {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const providerUrl = process.env.EMAIL_PROVIDER_URL;
  const from = process.env.EMAIL_FROM ?? "notifications@cadre.to";
  if (!apiKey || !providerUrl) {
    return { ok: false, detail: "email provider not configured (stub)" };
  }
  try {
    const res = await fetch(providerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        text: args.text,
        html: args.html,
      }),
    });
    return { ok: res.ok, detail: res.ok ? undefined : `provider status ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Fan out an approval notification to every Space member's configured
 * channels (email + HMAC-signed webhook). Best-effort: failures are logged
 * as workEvents, never thrown — delivery never blocks the approval itself.
 */
export const deliverApproval = internalAction({
  args: {
    companyId: v.string(),
    spaceId: v.id("spaces"),
    approvalId: v.id("approvals"),
    title: v.string(),
    detail: v.optional(v.string()),
    riskLevel: v.optional(v.string()),
    preview: v.optional(v.any()),
    approveUrl: v.optional(v.string()),
    denyUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ delivered: string[] }> => {
    const prefs = await ctx.runQuery(internal.notifications.prefsForCategory, {
      spaceId: args.spaceId,
      category: "approval",
    });
    const delivered = new Set<string>();
    for (const pref of prefs) {
      if (pref.emailEnabled && pref.emailAddress) {
        const lines = [
          args.detail ?? "",
          args.riskLevel ? `Risk: ${args.riskLevel}` : "",
          args.approveUrl ? `Approve: ${args.approveUrl}` : "",
          args.denyUrl ? `Deny: ${args.denyUrl}` : "",
        ].filter(Boolean);
        const res = await sendEmailViaProvider({
          to: pref.emailAddress,
          subject: `Approval needed: ${args.title}`,
          text: lines.join("\n"),
        });
        if (res.ok) delivered.add("email");
        else {
          await ctx.runMutation(internal.approvals.logDeliveryFailure, {
            companyId: args.companyId,
            spaceId: args.spaceId,
            approvalId: args.approvalId,
            channel: "email",
            detail: res.detail,
          });
        }
      }
      if (pref.webhookEnabled && pref.webhookUrl) {
        try {
          const payload = JSON.stringify({
            type: "approval.requested",
            approvalId: args.approvalId,
            title: args.title,
            detail: args.detail,
            riskLevel: args.riskLevel,
            preview: args.preview,
            approveUrl: args.approveUrl,
            denyUrl: args.denyUrl,
            ts: Date.now(),
          });
          let signature = "";
          if (pref.webhookSecretRef) {
            const secret = await ctx.runQuery(internal.secrets.getOneForConnector, {
              spaceId: args.spaceId,
              name: pref.webhookSecretRef,
            });
            if (secret) signature = await hmacSha256Hex(secret.value, payload);
          }
          const res = await fetch(pref.webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(signature ? { "X-Cadre-Signature": `sha256=${signature}` } : {}),
            },
            body: payload,
          });
          if (res.ok) delivered.add("webhook");
          else {
            await ctx.runMutation(internal.approvals.logDeliveryFailure, {
              companyId: args.companyId,
              spaceId: args.spaceId,
              approvalId: args.approvalId,
              channel: "webhook",
              detail: `status ${res.status}`,
            });
          }
        } catch (e) {
          await ctx.runMutation(internal.approvals.logDeliveryFailure, {
            companyId: args.companyId,
            spaceId: args.spaceId,
            approvalId: args.approvalId,
            channel: "webhook",
            detail: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    if (delivered.size) {
      await ctx.runMutation(internal.approvals.recordDeliveredChannels, {
        approvalId: args.approvalId,
        channels: Array.from(delivered),
      });
    }
    return { delivered: Array.from(delivered) };
  },
});

/** Manual test-send for a user's own webhook/email config (Settings UI). */
export const testDeliver = action({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }): Promise<{ email?: string; webhook?: string }> => {
    const result: { email?: string; webhook?: string } = {};
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const pref: {
      emailEnabled?: boolean;
      emailAddress?: string;
      webhookEnabled?: boolean;
      webhookUrl?: string;
      webhookSecretRef?: string;
    } | null = await ctx.runQuery(internal.notifications.getPrefsInternal, {
      spaceId,
      userId: identity.subject,
    });
    if (!pref) return result;
    if (pref.emailEnabled && pref.emailAddress) {
      const res = await sendEmailViaProvider({
        to: pref.emailAddress,
        subject: "Cadre test notification",
        text: "This is a test delivery from Cadre's approval notification channels.",
      });
      result.email = res.ok ? "sent" : (res.detail ?? "failed");
    }
    if (pref.webhookEnabled && pref.webhookUrl) {
      try {
        const payload = JSON.stringify({ type: "test", ts: Date.now() });
        let signature = "";
        if (pref.webhookSecretRef) {
          const secret = await ctx.runQuery(internal.secrets.getOneForConnector, {
            spaceId,
            name: pref.webhookSecretRef,
          });
          if (secret) signature = await hmacSha256Hex(secret.value, payload);
        }
        const res = await fetch(pref.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(signature ? { "X-Cadre-Signature": `sha256=${signature}` } : {}),
          },
          body: payload,
        });
        result.webhook = res.ok ? "sent" : `status ${res.status}`;
      } catch (e) {
        result.webhook = e instanceof Error ? e.message : String(e);
      }
    }
    return result;
  },
});

/** Internal: fetch a specific user's prefs. `userId` comes from the caller's
 * own auth identity resolved in the calling action, never from client input. */
export const getPrefsInternal = internalQuery({
  args: { spaceId: v.id("spaces"), userId: v.string() },
  handler: async (ctx, { spaceId, userId }): Promise<null | {
    emailEnabled?: boolean;
    emailAddress?: string;
    webhookEnabled?: boolean;
    webhookUrl?: string;
    webhookSecretRef?: string;
  }> => {
    const row = await ctx.db
      .query("notificationPrefs")
      .withIndex("by_space_user", (q) => q.eq("spaceId", spaceId).eq("userId", userId))
      .unique();
    return row;
  },
});
