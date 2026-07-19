import { v } from "convex/values";
import {
  query,
  action,
  internalAction,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { embed } from "./embeddings";

const SCOPE = v.union(v.literal("space"), v.literal("company"));

/** List memories visible in a Space: its own + company-wide. */
export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    const own = await ctx.db
      .query("memories")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
    const company = await ctx.db
      .query("memories")
      .withIndex("by_company", (q) => q.eq("companyId", scope.companyId))
      .order("desc")
      .collect();
    // Company-wide memories from OTHER spaces (own already included above).
    const extra = company.filter(
      (m) => m.scope === "company" && m.spaceId !== spaceId,
    );
    return [...own, ...extra].sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const add = action({
  args: {
    spaceId: v.id("spaces"),
    title: v.string(),
    content: v.string(),
    scope: v.optional(SCOPE),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Id<"memories">> => {
    const embedding = await embed(`${args.title}\n\n${args.content}`);
    return await ctx.runMutation(internal.memories.insert, {
      ...args,
      embedding: embedding ?? undefined,
    });
  },
});

export const ingestText = action({
  args: {
    spaceId: v.id("spaces"),
    title: v.string(),
    content: v.string(),
    scope: v.optional(SCOPE),
  },
  handler: async (ctx, args): Promise<Id<"memories">> => {
    const embedding = await embed(`${args.title}\n\n${args.content}`);
    return await ctx.runMutation(internal.memories.insert, {
      spaceId: args.spaceId,
      title: args.title,
      content: args.content.slice(0, 8000),
      scope: args.scope ?? "space",
      source: "document",
      embedding: embedding ?? undefined,
    });
  },
});

export const ingestUrl = action({
  args: {
    spaceId: v.id("spaces"),
    url: v.string(),
    scope: v.optional(SCOPE),
  },
  handler: async (ctx, args): Promise<Id<"memories">> => {
    let html: string;
    try {
      const res = await fetch(args.url);
      if (!res.ok) throw new Error("Bad status");
      html = await res.text();
    } catch {
      throw new Error("Could not fetch URL");
    }
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
    const title = `URL: ${args.url}`;
    const embedding = await embed(`${title}\n\n${text}`);
    return await ctx.runMutation(internal.memories.insert, {
      spaceId: args.spaceId,
      title,
      content: text,
      scope: args.scope ?? "space",
      source: "url",
      embedding: embedding ?? undefined,
    });
  },
});

export const insert = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    title: v.string(),
    content: v.string(),
    scope: v.optional(SCOPE),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, { spaceId, scope, source, ...rest }) => {
    const s = await resolveScope(ctx, spaceId);
    requireRole(s, "operator");
    return await ctx.db.insert("memories", {
      companyId: s.companyId,
      spaceId,
      scope: scope ?? "space",
      source: source ?? "manual",
      ...rest,
      createdAt: Date.now(),
    });
  },
});

export const remove = action({
  args: { spaceId: v.id("spaces"), memoryId: v.id("memories") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runMutation(internal.memories.doRemove, args);
  },
});

export const doRemove = internalMutation({
  args: { spaceId: v.id("spaces"), memoryId: v.id("memories") },
  handler: async (ctx, { spaceId, memoryId }) => {
    const s = await resolveScope(ctx, spaceId);
    requireRole(s, "operator");
    const m = await ctx.db.get(memoryId);
    if (!m || m.companyId !== s.companyId) throw new Error("Not found");
    await ctx.db.delete(memoryId);
  },
});

// ---------------------------------------------------------------------------
// Retrieval (RAG) — semantic search over space + company-wide memory.
// ---------------------------------------------------------------------------

export const companyForSpace = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }): Promise<{ companyId: string }> => {
    const s = await resolveScope(ctx, spaceId);
    return { companyId: s.companyId };
  },
});

export const byIds = internalQuery({
  args: { ids: v.array(v.id("memories")) },
  handler: async (ctx, { ids }) => {
    return await Promise.all(ids.map((id) => ctx.db.get(id)));
  },
});

/** Core retrieval shared by the dashboard and the connector context API. */
async function retrieve(
  ctx: { vectorSearch: any; runQuery: any },
  spaceId: Id<"spaces">,
  companyId: string,
  queryText: string,
  limit: number,
): Promise<Doc<"memories">[]> {
  const vector = await embed(queryText);
  if (!vector) return [];
  // Filter to the company (isolation), then keep this Space's own + company-wide.
  const results = await ctx.vectorSearch("memories", "by_embedding", {
    vector,
    limit: limit * 4,
    filter: (q: any) => q.eq("companyId", companyId),
  });
  const score = new Map<string, number>(
    results.map((r: { _id: string; _score: number }) => [r._id, r._score]),
  );
  const docs = await ctx.runQuery(internal.memories.byIds, {
    ids: results.map((r: { _id: Id<"memories"> }) => r._id),
  });
  return docs
    .filter(
      (d: any) =>
        d && (d.spaceId === spaceId || d.scope === "company"),
    )
    .sort((a: any, b: any) => (score.get(b._id) ?? 0) - (score.get(a._id) ?? 0))
    .slice(0, limit);
}

export const search = action({
  args: {
    spaceId: v.id("spaces"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { spaceId, query, limit }): Promise<Doc<"memories">[]> => {
    const { companyId } = await ctx.runQuery(
      internal.memories.companyForSpace,
      { spaceId },
    );
    return await retrieve(ctx, spaceId, companyId, query, limit ?? 8);
  },
});

/** Connector/agent-facing retrieval (no user identity; scope from the agent). */
export const retrieveForConnector = internalAction({
  args: {
    spaceId: v.id("spaces"),
    companyId: v.string(),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { spaceId, companyId, query, limit }): Promise<Doc<"memories">[]> => {
    return await retrieve(ctx, spaceId, companyId, query, limit ?? 8);
  },
});

// ---------------------------------------------------------------------------
// Ingestion — turn a thread's conversation into reusable memory.
// ---------------------------------------------------------------------------

export const threadText = internalQuery({
  args: { spaceId: v.id("spaces"), threadId: v.id("threads") },
  handler: async (ctx, { spaceId, threadId }) => {
    const s = await resolveScope(ctx, spaceId);
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.spaceId !== spaceId) return null;
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("asc")
      .take(50);
    return {
      companyId: s.companyId,
      title: thread.title,
      text: msgs.map((m) => `${m.role}: ${m.content}`).join("\n"),
    };
  },
});

export const ingestThread = action({
  args: { spaceId: v.id("spaces"), threadId: v.id("threads") },
  handler: async (ctx, { spaceId, threadId }): Promise<Id<"memories"> | null> => {
    const data = await ctx.runQuery(internal.memories.threadText, {
      spaceId,
      threadId,
    });
    if (!data || !data.text.trim()) return null;
    const content = data.text.slice(0, 6000);
    const embedding = await embed(`${data.title}\n\n${content}`);
    return await ctx.runMutation(internal.memories.insert, {
      spaceId,
      title: `Thread: ${data.title}`,
      content,
      scope: "space",
      source: "thread",
      embedding: embedding ?? undefined,
    });
  },
});

// ---------------------------------------------------------------------------
// Write-back hooks (feature 14) — connectors call this after a task/step
// completes so the agent's work becomes reusable memory automatically,
// instead of relying on someone manually ingesting a thread. Space-scoped,
// internal-only (the connector authenticates the agent by token before
// reaching this; the actual HTTP route lives in http.ts, owned by another
// team — see the cycle report for the one-line wiring request).
// ---------------------------------------------------------------------------

const MAX_INGEST_CONTENT = 8000;
const SUMMARY_TARGET_CHARS = 1200;

/**
 * Summarize free text down to a memory-sized blurb. Uses an OpenAI chat
 * completion when OPENAI_API_KEY is configured; otherwise degrades
 * gracefully to a naive head-truncation so ingestion never hard-fails just
 * because summarization is unavailable.
 */
async function summarize(text: string): Promise<string> {
  const trimmed = text.trim();
  if (trimmed.length <= SUMMARY_TARGET_CHARS) return trimmed;

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return trimmed.slice(0, SUMMARY_TARGET_CHARS) + "…";
  }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content:
              "Summarize the following agent task output into a concise, reusable memory note " +
              `(max ~${Math.round(SUMMARY_TARGET_CHARS / 5)} words). Keep concrete facts, decisions, ` +
              "and outcomes; drop filler.\n\n" +
              trimmed.slice(0, MAX_INGEST_CONTENT),
          },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const out = data.choices?.[0]?.message?.content?.trim();
    return out && out.length ? out : trimmed.slice(0, SUMMARY_TARGET_CHARS) + "…";
  } catch {
    return trimmed.slice(0, SUMMARY_TARGET_CHARS) + "…";
  }
}

/**
 * Internal write-back entrypoint: connectors call this after a task/workflow
 * step finishes to summarize-and-store the result as space-scoped memory.
 * `sourceId` is a loose string (task id, run step id, thread id, ...) rather
 * than a typed reference, since callers may not yet have a durable Convex id
 * for the thing that completed (e.g. an ephemeral connector-side task).
 */
export const ingestFromCompletion = internalAction({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.optional(v.id("agents")),
    title: v.string(),
    content: v.string(),
    sourceKind: v.optional(v.string()), // "task" | "run_step" | "thread" | ...
    sourceId: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Id<"memories"> | null> => {
    if (!args.content.trim()) return null;
    const summary = await summarize(args.content);
    const embedding = await embed(`${args.title}\n\n${summary}`);
    const id: Id<"memories"> = await ctx.runMutation(internal.memories.insertFromConnector, {
      spaceId: args.spaceId,
      agentId: args.agentId,
      title: args.title,
      content: summary,
      source: args.sourceKind ?? "connector",
      tags: args.tags,
      embedding: embedding ?? undefined,
    });
    return id;
  },
});

/**
 * Connector-facing variant of `insert` — bypasses the user-identity role
 * check (there is no signed-in user in this path) but stays space-scoped:
 * the spaceId is trusted because the caller (the connector HTTP handler)
 * already authenticated the agent's token against that Space.
 */
export const insertFromConnector = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.optional(v.id("agents")),
    title: v.string(),
    content: v.string(),
    source: v.string(),
    tags: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, { spaceId, agentId, title, content, source, tags, embedding }) => {
    const space = await ctx.db.get(spaceId);
    if (!space) throw new Error("Space not found");
    if (agentId) {
      const agent = await ctx.db.get(agentId);
      if (!agent || agent.spaceId !== spaceId) throw new Error("Agent not in Space");
    }
    return await ctx.db.insert("memories", {
      companyId: space.companyId,
      spaceId,
      scope: "space",
      source,
      title,
      content,
      tags,
      embedding,
      createdAt: Date.now(),
    });
  },
});
