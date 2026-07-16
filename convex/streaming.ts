import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { resolveScope } from "./lib/auth";

/**
 * Real-time token streaming for agent replies.
 *
 * The connector streams tokens to an HTTP endpoint which buffers a few tokens
 * at a time and calls `appendChunk` (one row per buffered chunk — NOT per
 * token — to keep Convex write cost sane). The dashboard subscribes to
 * `chunks` and Convex reactivity pushes new chunks live as they land. When the
 * reply completes, `finalizeStream` concatenates the chunks into a permanent
 * `messages` row and deletes the transient `streamChunks` rows.
 */

/** Append a buffered chunk of streamed tokens. Token-authenticated path. */
export const appendChunk = internalMutation({
  args: {
    companyId: v.string(),
    spaceId: v.id("spaces"),
    threadId: v.id("threads"),
    streamId: v.string(),
    seq: v.number(),
    text: v.string(),
    done: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"streamChunks">> => {
    return await ctx.db.insert("streamChunks", {
      companyId: args.companyId,
      spaceId: args.spaceId,
      threadId: args.threadId,
      streamId: args.streamId,
      seq: args.seq,
      text: args.text,
      done: args.done,
      createdAt: Date.now(),
    });
  },
});

/** Live-subscribed: all chunks for a stream, ordered by seq. */
export const chunks = query({
  args: { spaceId: v.id("spaces"), streamId: v.string() },
  handler: async (ctx, { spaceId, streamId }): Promise<Doc<"streamChunks">[]> => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("streamChunks")
      .withIndex("by_stream", (q) => q.eq("streamId", streamId))
      .order("asc")
      .collect();
  },
});

/**
 * The most recent non-finalized streamId for a thread, or null. A stream is
 * "active" while its chunks still exist (finalizeStream deletes them once the
 * reply is committed to `messages`). The UI subscribes to chunks for it.
 */
export const activeStream = query({
  args: { spaceId: v.id("spaces"), threadId: v.id("threads") },
  handler: async (ctx, { spaceId, threadId }): Promise<string | null> => {
    await resolveScope(ctx, spaceId);
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.spaceId !== spaceId) return null;
    // Most recently created chunk for this thread wins.
    const rows = await ctx.db
      .query("streamChunks")
      .withIndex("by_stream")
      .collect();
    let latest: Doc<"streamChunks"> | null = null;
    for (const row of rows) {
      if (row.threadId !== threadId || row.spaceId !== spaceId) continue;
      if (!latest || row.createdAt > latest.createdAt) latest = row;
    }
    return latest ? latest.streamId : null;
  },
});

/**
 * Concatenate a finished stream's chunks into a permanent assistant message,
 * bump the thread counts (mirroring messages.appendFromConnector), then delete
 * the transient chunk rows so the table stays small. Token-authenticated path.
 */
export const finalizeStream = internalMutation({
  args: {
    companyId: v.string(),
    spaceId: v.id("spaces"),
    threadId: v.id("threads"),
    streamId: v.string(),
  },
  handler: async (
    ctx,
    { companyId, spaceId, threadId, streamId },
  ): Promise<Id<"messages"> | null> => {
    const rows = await ctx.db
      .query("streamChunks")
      .withIndex("by_stream", (q) => q.eq("streamId", streamId))
      .order("asc")
      .collect();
    if (rows.length === 0) return null;

    const content = rows.map((r) => r.text).join("");
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.spaceId !== spaceId) {
      // Still clear the orphaned chunks so the table doesn't grow.
      for (const r of rows) await ctx.db.delete(r._id);
      return null;
    }

    const messageId = await ctx.db.insert("messages", {
      companyId,
      spaceId,
      threadId,
      agentId: thread.agentId,
      role: "assistant",
      content,
      createdAt: Date.now(),
    });
    await ctx.db.patch(threadId, {
      lastMessageAt: Date.now(),
      messageCount: (thread.messageCount ?? 0) + 1,
    });

    for (const r of rows) await ctx.db.delete(r._id);
    return messageId;
  },
});
