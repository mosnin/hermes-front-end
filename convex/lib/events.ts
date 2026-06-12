import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Append to the immutable work record. This is the source of truth for
 * "what got done" — never updated, only appended.
 */
export async function recordWorkEvent(
  ctx: MutationCtx,
  args: {
    companyId: string;
    spaceId: Id<"spaces">;
    actorType: "agent" | "user" | "system" | "workflow";
    actorId?: string;
    agentId?: Id<"agents">;
    workflowRunId?: Id<"workflowRuns">;
    category: string;
    action: string;
    summary: string;
    payload?: unknown;
  },
): Promise<void> {
  await ctx.db.insert("workEvents", {
    companyId: args.companyId,
    spaceId: args.spaceId,
    actorType: args.actorType,
    actorId: args.actorId,
    agentId: args.agentId,
    workflowRunId: args.workflowRunId,
    category: args.category,
    action: args.action,
    summary: args.summary,
    payload: args.payload,
    createdAt: Date.now(),
  });
}

/** Append to the live activity feed. */
export async function recordActivity(
  ctx: MutationCtx,
  args: {
    companyId: string;
    spaceId: Id<"spaces">;
    agentId?: Id<"agents">;
    threadId?: Id<"threads">;
    workflowRunId?: Id<"workflowRuns">;
    type: string;
    title: string;
    detail?: string;
    payload?: unknown;
  },
): Promise<void> {
  await ctx.db.insert("activity", {
    companyId: args.companyId,
    spaceId: args.spaceId,
    agentId: args.agentId,
    threadId: args.threadId,
    workflowRunId: args.workflowRunId,
    type: args.type,
    title: args.title,
    detail: args.detail,
    payload: args.payload,
    createdAt: Date.now(),
  });
}
