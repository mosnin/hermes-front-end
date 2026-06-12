import { QueryCtx, MutationCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/**
 * Require an authenticated caller and return the Clerk identity.
 * Throws if the request is not authenticated.
 */
export async function requireIdentity(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated: sign in to access the control plane.");
  }
  return identity;
}

/**
 * The tenant id that scopes all data.
 *
 * - Enterprise/team accounts: the active Clerk organization id (`org_id`).
 * - Consumer accounts (no active org): the Clerk user id (`subject`).
 *
 * To get `org_id` into the token, add it to the Clerk "convex" JWT template
 * claims: { "org_id": "{{org.id}}" }. Until then this falls back to the user id,
 * so the app works for individual users out of the box.
 */
export async function getOwnerId(ctx: Ctx): Promise<string> {
  const identity = await requireIdentity(ctx);
  const orgId = (identity as { org_id?: string }).org_id;
  return orgId ?? identity.subject;
}
