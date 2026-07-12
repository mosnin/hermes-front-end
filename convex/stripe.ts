import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent, recordNotification } from "./lib/events";

/**
 * Stripe billing — plans become paid, automatically.
 *
 * Env-gated: nothing here activates until these are set in the CONVEX env
 * (npx convex env set ...):
 *   STRIPE_SECRET_KEY        sk_live_... / sk_test_...
 *   STRIPE_WEBHOOK_SECRET    whsec_... (from the webhook endpoint config)
 *   STRIPE_PRICE_TEAM        price_... for the Team plan
 *   STRIPE_PRICE_ENTERPRISE  price_... for the Enterprise plan
 *   APP_URL                  https://your-app.example (checkout redirects)
 *
 * Flow: dashboard calls createCheckout → Stripe-hosted checkout → Stripe fires
 * checkout.session.completed at /billing/stripe/webhook (signature-verified)
 * → applyPlanFromStripe upgrades the Space. Subscription cancellation
 * downgrades back to free. The plan limits themselves are enforced
 * server-side in lib/plans.ts, so billing state IS entitlement state.
 */

const STRIPE_API = "https://api.stripe.com/v1";

function priceEnvFor(plan: "team" | "enterprise"): string | undefined {
  return plan === "team"
    ? process.env.STRIPE_PRICE_TEAM
    : process.env.STRIPE_PRICE_ENTERPRISE;
}

/** Authorize the caller (admin of the Space) and hand back checkout context. */
export const checkoutContext = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    return { companyId: scope.companyId, userId: scope.userId };
  },
});

/** Create a Stripe Checkout session for a plan upgrade; returns its URL. */
export const createCheckout = action({
  args: {
    spaceId: v.id("spaces"),
    plan: v.union(v.literal("team"), v.literal("enterprise")),
  },
  handler: async (ctx, { spaceId, plan }): Promise<{ url: string }> => {
    const key = process.env.STRIPE_SECRET_KEY;
    const price = priceEnvFor(plan);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    if (!key || !price) {
      throw new Error(
        "Stripe is not configured — set STRIPE_SECRET_KEY and STRIPE_PRICE_* in the Convex env",
      );
    }
    // Authorize against the Space (admin) before creating anything on Stripe.
    await ctx.runQuery(internal.stripe.checkoutContext, { spaceId });

    const params = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      success_url: `${appUrl}/dashboard/billing?upgraded=1`,
      cancel_url: `${appUrl}/dashboard/billing?canceled=1`,
      // Metadata on both the session and the subscription so BOTH the
      // completed-checkout and later subscription-deleted events can be
      // mapped back to the Space.
      "metadata[spaceId]": spaceId,
      "metadata[plan]": plan,
      "subscription_data[metadata][spaceId]": spaceId,
      "subscription_data[metadata][plan]": plan,
    });
    const resp = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const data = (await resp.json()) as { url?: string; error?: { message?: string } };
    if (!resp.ok || !data.url) {
      throw new Error(`Stripe checkout failed: ${data.error?.message ?? resp.status}`);
    }
    return { url: data.url };
  },
});

/** Apply a plan change decided by a verified Stripe webhook event. */
export const applyPlanFromStripe = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    plan: v.union(
      v.literal("free"),
      v.literal("team"),
      v.literal("enterprise"),
    ),
    stripeEvent: v.string(),
  },
  handler: async (ctx, { spaceId, plan, stripeEvent }) => {
    const space = await ctx.db.get(spaceId);
    if (!space) return; // Space deleted since checkout — nothing to do.
    await ctx.db.patch(spaceId, { plan });
    await recordWorkEvent(ctx, {
      companyId: space.companyId,
      spaceId,
      actorType: "system",
      category: "billing",
      action: "plan_changed",
      summary: `Plan → ${plan} (Stripe: ${stripeEvent})`,
    });
    await recordNotification(ctx, {
      companyId: space.companyId,
      spaceId,
      type: "system",
      title:
        plan === "free"
          ? "Subscription ended — Space downgraded to free"
          : `Space upgraded to ${plan}`,
      href: "/dashboard/billing",
    });
  },
});

/**
 * Process a verified Stripe event (called by the webhook route AFTER signature
 * verification). Exported for the webhook + tests.
 */
export function planChangeFromEvent(event: {
  type?: string;
  data?: { object?: { metadata?: Record<string, string> } };
}): { spaceId: string; plan: "free" | "team" | "enterprise" } | null {
  const meta = event.data?.object?.metadata;
  const spaceId = meta?.spaceId;
  if (!spaceId) return null;
  if (event.type === "checkout.session.completed") {
    const plan = meta?.plan;
    if (plan === "team" || plan === "enterprise") return { spaceId, plan };
    return null;
  }
  if (event.type === "customer.subscription.deleted") {
    return { spaceId, plan: "free" };
  }
  return null;
}
