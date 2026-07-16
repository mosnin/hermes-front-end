import { QueryCtx, MutationCtx } from "../_generated/server";
import { requireIdentity } from "./auth";

type Ctx = QueryCtx | MutationCtx;

/**
 * Platform (super) admin authorization.
 *
 * SOC2 CC6.1/CC6.3 — least privilege: platform admin is NOT a tenant role and
 * cannot be self-granted. The allowlist lives in the deployment environment
 * (PLATFORM_ADMIN_IDS = comma-separated Clerk subject ids and/or emails), so
 * granting it is a controlled change-management action, never a data write a
 * compromised tenant could perform. Every privileged call resolves the caller's
 * verified Clerk identity and checks it against that allowlist.
 */

export type PlatformAdmin = {
  adminId: string;
  email?: string;
};

function allowlist(): string[] {
  return (process.env.PLATFORM_ADMIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** True if the caller is a configured platform admin (no throw). */
export async function isPlatformAdmin(ctx: Ctx): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;
  const list = allowlist();
  if (list.length === 0) return false;
  const subject = identity.subject.toLowerCase();
  const email = (identity.email ?? "").toLowerCase();
  return list.includes(subject) || (!!email && list.includes(email));
}

/** Throw unless the caller is a configured platform admin. */
export async function requirePlatformAdmin(ctx: Ctx): Promise<PlatformAdmin> {
  const identity = await requireIdentity(ctx);
  const list = allowlist();
  if (list.length === 0) {
    // Fail closed: with no allowlist configured, nobody is a platform admin.
    throw new Error("Forbidden: platform administration is not configured.");
  }
  const subject = identity.subject.toLowerCase();
  const email = (identity.email ?? "").toLowerCase();
  if (!list.includes(subject) && !(email && list.includes(email))) {
    throw new Error("Forbidden: platform administrator access required.");
  }
  return { adminId: identity.subject, email: identity.email };
}

/**
 * Write an immutable admin-audit record. Call for EVERY privileged read and
 * write in the admin surface — SOC2 CC7.2 requires privileged actions to be
 * logged and attributable. Mutation-context only (audit is a write).
 */
export async function auditAdmin(
  ctx: MutationCtx,
  admin: PlatformAdmin,
  entry: {
    action: string;
    resource?: string;
    target?: string;
    detail?: string;
    severity?: "info" | "warning" | "critical";
  },
): Promise<void> {
  await ctx.db.insert("adminAudit", {
    adminId: admin.adminId,
    adminEmail: admin.email,
    action: entry.action,
    resource: entry.resource,
    target: entry.target,
    detail: entry.detail,
    severity: entry.severity ?? "info",
    createdAt: Date.now(),
  });
}
