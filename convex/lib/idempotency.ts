import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * At-most-once guard for retried connector ingestion. Returns true the first
 * time an (agent, key) pair is seen (and records it), false on every retry — so
 * a network blip after the server already processed a POST can't double-write.
 * No key supplied → always true (no dedupe), preserving existing behaviour.
 */
export async function firstSeen(
  ctx: MutationCtx,
  agentId: Id<"agents">,
  key: string | undefined,
): Promise<boolean> {
  if (!key) return true;
  const existing = await ctx.db
    .query("idempotencyKeys")
    .withIndex("by_agent_key", (q) => q.eq("agentId", agentId).eq("key", key))
    .unique();
  if (existing) return false;
  await ctx.db.insert("idempotencyKeys", { agentId, key, createdAt: Date.now() });
  return true;
}
