import { v } from "convex/values";
import {
  query,
  mutation,
  internalAction,
  internalMutation,
  internalQuery,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent, recordNotification } from "./lib/events";
import { generateToken, sha256Hex } from "./lib/crypto";

const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** List approval requests for a Space, newest first; optionally filtered by status. */
export const list = query({
  args: { spaceId: v.id("spaces"), status: v.optional(v.string()) },
  handler: async (ctx, { spaceId, status }) => {
    await resolveScope(ctx, spaceId);
    if (status) {
      return await ctx.db
        .query("approvals")
        .withIndex("by_space_status", (q) =>
          q.eq("spaceId", spaceId).eq("status", status as never),
        )
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("approvals")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
  },
});

/** Count of pending approvals awaiting a decision in this Space. */
export const pendingCount = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("approvals")
      .withIndex("by_space_status", (q) =>
        q.eq("spaceId", spaceId).eq("status", "pending"),
      )
      .collect();
    return rows.length;
  },
});

/** Open a human-in-the-loop approval gate (operator+). */
export const request = mutation({
  args: {
    spaceId: v.id("spaces"),
    kind: v.string(),
    title: v.string(),
    detail: v.optional(v.string()),
    agentId: v.optional(v.id("agents")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    payload: v.optional(v.any()),
    // Richer approvals UI (feature 19): structured diff/preview of the
    // pending action, and a coarse risk rating for sorting/highlighting.
    preview: v.optional(v.any()),
    riskLevel: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    ttlMs: v.optional(v.number()),
  },
  handler: async (ctx, { spaceId, ttlMs, ...args }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const now = Date.now();
    const expiresAt = now + Math.max(5 * 60 * 1000, ttlMs ?? DEFAULT_TOKEN_TTL_MS);
    const approvalId = await ctx.db.insert("approvals", {
      companyId: scope.companyId,
      spaceId,
      kind: args.kind,
      title: args.title,
      detail: args.detail,
      agentId: args.agentId,
      workflowRunId: args.workflowRunId,
      payload: args.payload,
      preview: args.preview,
      riskLevel: args.riskLevel,
      expiresAt,
      status: "pending",
      requestedBy: scope.userId,
      createdAt: now,
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId: args.agentId,
      workflowRunId: args.workflowRunId,
      category: "governance",
      action: "approval_requested",
      summary: args.title,
    });
    await recordNotification(ctx, {
      companyId: scope.companyId,
      spaceId,
      type: "approval",
      title: `Approval needed: ${args.title}`,
      body: args.detail,
      href: "/dashboard/approvals",
    });

    // One-click approve/deny (feature 19): mint short-lived single-use tokens
    // and fan out to configured channels. Runs after the mutation commits so
    // token minting (crypto) and delivery (fetch) never block the write path.
    await ctx.scheduler.runAfter(0, internal.approvals.issueTokensAndDeliver, {
      approvalId,
    });

    return approvalId;
  },
});

/** Approve or reject a pending gate (admin+). */
export const decide = mutation({
  args: {
    spaceId: v.id("spaces"),
    approvalId: v.id("approvals"),
    approve: v.boolean(),
  },
  handler: async (ctx, { spaceId, approvalId, approve }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const approval = await ctx.db.get(approvalId);
    if (!approval || approval.spaceId !== spaceId) throw new Error("Not found");
    await applyDecision(ctx, approval, approve, {
      decidedBy: scope.userId,
      companyId: scope.companyId,
      spaceId,
    });
  },
});

/** Bulk approve/reject several pending gates at once (admin+). Best-effort per
 * row — one failure (already decided, wrong Space) doesn't abort the rest. */
export const bulkDecide = mutation({
  args: {
    spaceId: v.id("spaces"),
    approvalIds: v.array(v.id("approvals")),
    approve: v.boolean(),
  },
  handler: async (ctx, { spaceId, approvalIds, approve }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    let succeeded = 0;
    const failed: Id<"approvals">[] = [];
    for (const approvalId of approvalIds) {
      const approval = await ctx.db.get(approvalId);
      if (!approval || approval.spaceId !== spaceId || approval.status !== "pending") {
        failed.push(approvalId);
        continue;
      }
      await applyDecision(ctx, approval, approve, {
        decidedBy: scope.userId,
        companyId: scope.companyId,
        spaceId,
      });
      succeeded++;
    }
    return { succeeded, failed };
  },
});

async function applyDecision(
  ctx: MutationCtx,
  approval: { _id: Id<"approvals">; title: string; agentId?: Id<"agents">; workflowRunId?: Id<"workflowRuns"> },
  approve: boolean,
  meta: { decidedBy: string; companyId: string; spaceId: Id<"spaces"> },
) {
  await ctx.db.patch(approval._id, {
    status: approve ? "approved" : "rejected",
    decidedBy: meta.decidedBy,
    decidedAt: Date.now(),
  });
  await recordWorkEvent(ctx, {
    companyId: meta.companyId,
    spaceId: meta.spaceId,
    actorType: "user",
    actorId: meta.decidedBy,
    agentId: approval.agentId,
    workflowRunId: approval.workflowRunId,
    category: "governance",
    action: approve ? "approval_granted" : "approval_rejected",
    summary: `${approve ? "Approved" : "Rejected"}: ${approval.title}`,
  });

  // If this approval gated a workflow run, release or kill it now.
  if (approval.workflowRunId) {
    const run = await ctx.db.get(approval.workflowRunId);
    if (run && run.status === "awaiting_approval") {
      if (approve) {
        await ctx.db.patch(run._id, { status: "running" });
        await ctx.scheduler.runAfter(0, internal.engine.advanceRun, {
          runId: run._id,
        });
      } else {
        await ctx.db.patch(run._id, {
          status: "killed",
          finishedAt: Date.now(),
        });
      }
    }
  }
}

// ===========================================================================
// One-click approve/deny via signed short-lived tokens (feature 19). Tokens
// are single-use (usedAt gate), expire, and are audit-logged on redemption.
// The routes that redeem them live in convex/http.ts (no auth cookie needed —
// safe for email/webhook links) and call `decideByToken` below.
// ===========================================================================

/** Internal: fetch a single approval for the action below (actions have no
 * `ctx.db` — this is the standard runQuery hop, mirroring apiKeys.create). */
export const getById = internalQuery({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, { approvalId }) => ctx.db.get(approvalId),
});

/** Persist minted token hashes. Never called with the raw token — only the
 * hash crosses back into a mutation, same pattern as apiKeys.insert. */
export const storeTokens = internalMutation({
  args: {
    approvalId: v.id("approvals"),
    companyId: v.string(),
    spaceId: v.id("spaces"),
    tokens: v.array(
      v.object({
        tokenHash: v.string(),
        action: v.union(v.literal("approve"), v.literal("deny")),
        expiresAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, { approvalId, companyId, spaceId, tokens }) => {
    const now = Date.now();
    for (const t of tokens) {
      await ctx.db.insert("approvalTokens", {
        companyId,
        spaceId,
        approvalId,
        tokenHash: t.tokenHash,
        action: t.action,
        expiresAt: t.expiresAt,
        createdAt: now,
      });
    }
  },
});

/**
 * Mint one-click approve/deny tokens and fan out delivery. An action (not a
 * mutation) because token generation needs Web Crypto (`crypto.randomUUID`),
 * which — like `apiKeys.create` — Convex only exposes to actions; mutations
 * must stay deterministic for optimistic-concurrency retries. Scheduled from
 * `request` with a single hop, then calls the delivery action directly
 * (actions may call other actions without another scheduler round-trip).
 */
export const issueTokensAndDeliver = internalAction({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, { approvalId }): Promise<void> => {
    const approval = await ctx.runQuery(internal.approvals.getById, { approvalId });
    if (!approval || approval.status !== "pending") return;
    const now = Date.now();
    const expiresAt = approval.expiresAt ?? now + DEFAULT_TOKEN_TTL_MS;

    const mint = async (tokenAction: "approve" | "deny") => {
      const raw = `apt_${generateToken()}`;
      const tokenHash = await sha256Hex(raw);
      return { raw, tokenHash, action: tokenAction as "approve" | "deny", expiresAt };
    };

    const approveToken = await mint("approve");
    const denyToken = await mint("deny");

    await ctx.runMutation(internal.approvals.storeTokens, {
      approvalId,
      companyId: approval.companyId,
      spaceId: approval.spaceId,
      tokens: [
        { tokenHash: approveToken.tokenHash, action: "approve", expiresAt },
        { tokenHash: denyToken.tokenHash, action: "deny", expiresAt },
      ],
    });

    const base = process.env.CONVEX_SITE_URL ?? "";
    const approveUrl = base ? `${base}/api/v1/approvals/token/${approveToken.raw}` : undefined;
    const denyUrl = base ? `${base}/api/v1/approvals/token/${denyToken.raw}` : undefined;

    await ctx.runAction(internal.notifications.deliverApproval, {
      companyId: approval.companyId,
      spaceId: approval.spaceId,
      approvalId,
      title: approval.title,
      detail: approval.detail,
      riskLevel: approval.riskLevel,
      preview: approval.preview,
      approveUrl,
      denyUrl,
    });
  },
});

/**
 * Redeem a one-click token: validates hash + expiry + single-use, decides
 * the approval, marks the token used, and audit-logs the redemption. Called
 * from the unauthenticated HTTP route in http.ts. An action (not a mutation)
 * because it needs Web Crypto (`sha256Hex` → `crypto.subtle`) — same
 * constraint as token minting — and immediately hands off to a mutation for
 * the actual state change.
 */
export const decideByToken = internalAction({
  args: { token: v.string(), override: v.optional(v.union(v.literal("approve"), v.literal("deny"))) },
  handler: async (
    ctx,
    { token, override },
  ): Promise<
    | { ok: true; approvalId: Id<"approvals">; decision: "approve" | "deny"; title: string }
    | { ok: false; error: string }
  > => {
    const tokenHash = await sha256Hex(token);
    return await ctx.runMutation(internal.approvals.decideByTokenHash, { tokenHash, override });
  },
});

/** DB half of token redemption — takes an already-computed hash, never the
 * raw token (mutations can't hash it themselves; see decideByToken above). */
export const decideByTokenHash = internalMutation({
  args: {
    tokenHash: v.string(),
    override: v.optional(v.union(v.literal("approve"), v.literal("deny"))),
  },
  handler: async (
    ctx,
    { tokenHash, override },
  ): Promise<
    | { ok: true; approvalId: Id<"approvals">; decision: "approve" | "deny"; title: string }
    | { ok: false; error: string }
  > => {
    const row = await ctx.db
      .query("approvalTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!row) return { ok: false, error: "invalid token" };
    if (row.usedAt) return { ok: false, error: "token already used" };
    if (row.expiresAt < Date.now()) return { ok: false, error: "token expired" };

    const decision: "approve" | "deny" =
      row.action === "either" ? (override ?? "approve") : (row.action as "approve" | "deny");
    if (row.action !== "either" && override && override !== row.action) {
      return { ok: false, error: "token does not permit that action" };
    }

    const approval = await ctx.db.get(row.approvalId);
    if (!approval) return { ok: false, error: "approval not found" };
    if (approval.status !== "pending") {
      return { ok: false, error: `already ${approval.status}` };
    }

    await ctx.db.patch(row._id, { usedAt: Date.now(), usedBy: row.recipient ?? "token" });
    await applyDecision(ctx, approval, decision === "approve", {
      decidedBy: row.recipient ? `token:${row.recipient}` : "token-link",
      companyId: approval.companyId,
      spaceId: approval.spaceId,
    });
    await recordWorkEvent(ctx, {
      companyId: approval.companyId,
      spaceId: approval.spaceId,
      actorType: "system",
      actorId: "approval-token",
      agentId: approval.agentId,
      workflowRunId: approval.workflowRunId,
      category: "governance",
      action: "approval_decided_via_link",
      summary: `${decision === "approve" ? "Approved" : "Rejected"} via one-click link: ${approval.title}`,
    });

    return { ok: true, approvalId: approval._id, decision, title: approval.title };
  },
});

/** Record which channels an approval was successfully delivered to. */
export const recordDeliveredChannels = internalMutation({
  args: { approvalId: v.id("approvals"), channels: v.array(v.string()) },
  handler: async (ctx, { approvalId, channels }) => {
    const approval = await ctx.db.get(approvalId);
    if (!approval) return;
    const existing = new Set(approval.deliveredChannels ?? []);
    for (const c of channels) existing.add(c);
    await ctx.db.patch(approvalId, { deliveredChannels: Array.from(existing) });
  },
});

/** Best-effort delivery failure audit (never thrown to the caller). */
export const logDeliveryFailure = internalMutation({
  args: {
    companyId: v.string(),
    spaceId: v.id("spaces"),
    approvalId: v.id("approvals"),
    channel: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, { companyId, spaceId, approvalId, channel, detail }) => {
    await recordWorkEvent(ctx, {
      companyId,
      spaceId,
      actorType: "system",
      actorId: "notification-delivery",
      category: "governance",
      action: "approval_delivery_failed",
      summary: `${channel} delivery failed for approval ${approvalId}${detail ? `: ${detail}` : ""}`,
    });
  },
});

/** Bounded retention sweep for expired/used approval tokens. */
export const sweepExpiredTokens = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    const cutoff = Date.now();
    const stale = await ctx.db
      .query("approvalTokens")
      .withIndex("by_expires", (q) => q.lt("expiresAt", cutoff))
      .take(500);
    for (const row of stale) await ctx.db.delete(row._id);
    return { deleted: stale.length };
  },
});

/** Internal: for the public API surface (feature 20). */
export const listForApi = internalQuery({
  args: { spaceId: v.id("spaces"), status: v.optional(v.string()) },
  handler: async (ctx, { spaceId, status }) => {
    const rows = status
      ? await ctx.db
          .query("approvals")
          .withIndex("by_space_status", (q) =>
            q.eq("spaceId", spaceId).eq("status", status as never),
          )
          .order("desc")
          .take(200)
      : await ctx.db
          .query("approvals")
          .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
          .order("desc")
          .take(200);
    return rows.map((a) => ({
      id: a._id,
      kind: a.kind,
      title: a.title,
      detail: a.detail,
      status: a.status,
      riskLevel: a.riskLevel,
      createdAt: a.createdAt,
      decidedAt: a.decidedAt,
    }));
  },
});

/** Internal: decide via the public API (feature 20), companyId/spaceId trusted
 * from the resolved API key, not from the request body. */
export const decideForApi = internalMutation({
  args: { spaceId: v.id("spaces"), companyId: v.string(), approvalId: v.id("approvals"), approve: v.boolean() },
  handler: async (ctx, { spaceId, companyId, approvalId, approve }) => {
    const approval = await ctx.db.get(approvalId);
    if (!approval || approval.spaceId !== spaceId) throw new Error("Not found");
    if (approval.status !== "pending") throw new Error(`Already ${approval.status}`);
    await applyDecision(ctx, approval, approve, {
      decidedBy: "api-key",
      companyId,
      spaceId,
    });
    return { ok: true };
  },
});
