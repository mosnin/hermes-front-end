import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

export type Role = "viewer" | "operator" | "admin" | "owner";

const RANK: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
  owner: 4,
};

export type Scope = {
  userId: string;
  companyId: string;
  spaceId: Id<"spaces">;
  space: Doc<"spaces">;
  role: Role;
};

export async function requireIdentity(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated: sign in to access the control plane.");
  }
  return identity;
}

/**
 * The Company (tenant) for the caller: the active Clerk organization id, or the
 * user id for solo/consumer accounts.
 */
export async function companyOf(ctx: Ctx): Promise<{ userId: string; companyId: string }> {
  const identity = await requireIdentity(ctx);
  const companyId =
    (identity as { org_id?: string }).org_id ?? identity.subject;
  return { userId: identity.subject, companyId };
}

/**
 * Resolve the caller's scope for a Space: verifies the Space belongs to the
 * caller's Company and that the caller is a member, returning their role.
 *
 * Isolation invariant: every Space-scoped function calls this, so data is only
 * ever read/written within a Space the caller belongs to.
 */
export async function resolveScope(
  ctx: Ctx,
  spaceId: Id<"spaces">,
): Promise<Scope> {
  const { userId, companyId } = await companyOf(ctx);
  const space = await ctx.db.get(spaceId);
  if (!space || space.companyId !== companyId) {
    throw new Error("Space not found");
  }
  const member = await ctx.db
    .query("spaceMembers")
    .withIndex("by_space_user", (q) =>
      q.eq("spaceId", spaceId).eq("userId", userId),
    )
    .unique();
  // The Space creator is always an owner, even before a membership row exists.
  const role: Role | null =
    member?.role ?? (space.createdBy === userId ? "owner" : null);
  if (!role) {
    throw new Error("Forbidden: you are not a member of this Space");
  }
  return { userId, companyId, spaceId, space, role };
}

/** Throw unless the scope's role meets the minimum required role. */
export function requireRole(scope: Scope, min: Role): void {
  if (RANK[scope.role] < RANK[min]) {
    throw new Error(
      `Forbidden: requires ${min} (you are ${scope.role})`,
    );
  }
}

export function hasRole(scope: Scope, min: Role): boolean {
  return RANK[scope.role] >= RANK[min];
}
