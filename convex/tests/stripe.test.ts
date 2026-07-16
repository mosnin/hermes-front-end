import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { hmacSha256Hex, verifyStripeSignature } from "../lib/crypto";
import { planChangeFromEvent } from "../stripe";

const modules = import.meta.glob("../**/*.*s");

describe("stripe webhook plumbing", () => {
  test("verifyStripeSignature accepts a valid t/v1 header and rejects forgeries", async () => {
    const secret = "whsec_test";
    const now = 1_700_000_000_000;
    const t = String(Math.floor(now / 1000));
    const body = '{"type":"checkout.session.completed"}';
    const v1 = await hmacSha256Hex(secret, `${t}.${body}`);

    expect(
      await verifyStripeSignature(secret, `t=${t},v1=${v1}`, body, now),
    ).toBe(true);
    // Tampered body and missing header are refused.
    expect(
      await verifyStripeSignature(secret, `t=${t},v1=${v1}`, '{"x":1}', now),
    ).toBe(false);
    expect(await verifyStripeSignature(secret, null, body, now)).toBe(false);
  });

  test("rotated-key header: any matching v1 passes", async () => {
    const secret = "whsec_test";
    const now = 1_700_000_000_000;
    const t = String(Math.floor(now / 1000));
    const body = "{}";
    const v1 = await hmacSha256Hex(secret, `${t}.${body}`);
    const stale = await hmacSha256Hex("old_secret", `${t}.${body}`);
    expect(
      await verifyStripeSignature(secret, `t=${t},v1=${stale},v1=${v1}`, body, now),
    ).toBe(true);
    // Replay 10 minutes later is refused
    expect(
      await verifyStripeSignature(
        secret,
        `t=${t},v1=${v1}`,
        body,
        now + 10 * 60 * 1000,
      ),
    ).toBe(false);
  });

  test("planChangeFromEvent maps checkout + cancellation, ignores junk", () => {
    expect(
      planChangeFromEvent({
        type: "checkout.session.completed",
        data: { object: { metadata: { spaceId: "s1", plan: "team" } } },
      }),
    ).toEqual({ spaceId: "s1", plan: "team" });
    expect(
      planChangeFromEvent({
        type: "customer.subscription.deleted",
        data: { object: { metadata: { spaceId: "s1", plan: "team" } } },
      }),
    ).toEqual({ spaceId: "s1", plan: "free" });
    // Unknown event / missing metadata / bogus plan → no change
    expect(planChangeFromEvent({ type: "invoice.paid", data: { object: {} } })).toBeNull();
    expect(
      planChangeFromEvent({
        type: "checkout.session.completed",
        data: { object: { metadata: { spaceId: "s1", plan: "platinum" } } },
      }),
    ).toBeNull();
  });

  test("applyPlanFromStripe upgrades the Space and lifts enforcement", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "u", org_id: "org_stripe" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "S" });

    await t.mutation(internal.stripe.applyPlanFromStripe, {
      spaceId,
      plan: "enterprise",
      stripeEvent: "checkout.session.completed",
    });
    const ent = await owner.query(api.billing.entitlements, { spaceId });
    expect(ent.plan).toBe("enterprise");

    // Downgrade on cancellation.
    await t.mutation(internal.stripe.applyPlanFromStripe, {
      spaceId,
      plan: "free",
      stripeEvent: "customer.subscription.deleted",
    });
    const ent2 = await owner.query(api.billing.entitlements, { spaceId });
    expect(ent2.plan).toBe("free");
  });
});
