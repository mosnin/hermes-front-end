import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveScope, requireRole } from "./lib/auth";

export const log = mutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    rating: v.number(),
    dimension: v.optional(v.string()),
    comment: v.optional(v.string()),
    threadId: v.optional(v.id("threads")),
  },
  handler: async (ctx, { spaceId, agentId, rating, dimension, comment, threadId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");
    return await ctx.db.insert("evals", {
      companyId: scope.companyId,
      spaceId,
      agentId,
      threadId,
      rating,
      dimension,
      comment,
      source: "human",
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, { spaceId, agentId }) => {
    await resolveScope(ctx, spaceId);
    if (agentId) {
      return await ctx.db
        .query("evals")
        .withIndex("by_agent", (q) => q.eq("agentId", agentId))
        .order("desc")
        .take(200);
    }
    return await ctx.db
      .query("evals")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(200);
  },
});

export const scorecards = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const [agents, evals] = await Promise.all([
      ctx.db
        .query("agents")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .collect(),
      ctx.db
        .query("evals")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .collect(),
    ]);

    return agents
      .map((a) => {
        const mine = evals.filter((e) => e.agentId === a._id);
        const count = mine.length;
        const avg = count ? mine.reduce((s, e) => s + e.rating, 0) / count : 0;
        return { agentId: a._id, name: a.name, count, avg };
      })
      .sort((a, b) => b.avg - a.avg);
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), evalId: v.id("evals") },
  handler: async (ctx, { spaceId, evalId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const row = await ctx.db.get(evalId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(evalId);
  },
});

// ---------------------------------------------------------------------------
// Automated (LLM-judge) evals
// ---------------------------------------------------------------------------

/**
 * Insert an auto-generated eval row. Mirrors `log` exactly but stamps
 * source "auto". Called from the autoEvaluate action via runMutation.
 */
export const insertAuto = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    rating: v.number(),
    dimension: v.optional(v.string()),
    comment: v.optional(v.string()),
    threadId: v.optional(v.id("threads")),
  },
  handler: async (ctx, { spaceId, agentId, rating, dimension, comment, threadId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");
    return await ctx.db.insert("evals", {
      companyId: scope.companyId,
      spaceId,
      agentId,
      threadId,
      rating,
      dimension,
      comment,
      source: "auto",
      createdAt: Date.now(),
    });
  },
});

/** Recent assistant text produced by an agent, for the LLM judge to rate. */
export const recentAgentText = internalQuery({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents") },
  handler: async (ctx, { spaceId, agentId }): Promise<string> => {
    await resolveScope(ctx, spaceId);
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .filter((q) =>
        q.and(
          q.eq(q.field("agentId"), agentId),
          q.eq(q.field("role"), "assistant"),
        ),
      )
      .take(10);
    return msgs
      .reverse()
      .map((m) => m.content)
      .join("\n\n");
  },
});

/**
 * Run an LLM judge over the agent's recent output and log an auto eval.
 * Falls back to a neutral rating when no OPENAI_API_KEY is configured or the
 * model response cannot be parsed.
 */
export const autoEvaluate = action({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    dimension: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { spaceId, agentId, dimension },
  ): Promise<{ rating: number; comment: string }> => {
    const text: string = await ctx.runQuery(internal.evals.recentAgentText, {
      spaceId,
      agentId,
    });

    let rating = 3;
    let comment = "auto-eval unavailable (no OPENAI_API_KEY)";

    const key = process.env.OPENAI_API_KEY;
    if (key) {
      try {
        const prompt =
          'Rate this agent\'s output quality from 1-5 and reply with ONLY a JSON object {"rating": n, "comment": "..."}.\n\n' +
          (text || "(no recent output)").slice(0, 8000);
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
          }),
        });
        if (!res.ok) throw new Error(`OpenAI ${res.status}`);
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const raw = data.choices?.[0]?.message?.content ?? "";
        const match = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(match ? match[0] : raw) as {
          rating?: unknown;
          comment?: unknown;
        };
        const n = Number(parsed.rating);
        rating = Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : 3;
        comment =
          typeof parsed.comment === "string" && parsed.comment.trim()
            ? parsed.comment.trim()
            : "auto-eval (no comment)";
      } catch {
        rating = 3;
        comment = "auto-eval failed to parse model response";
      }
    }

    await ctx.runMutation(internal.evals.insertAuto, {
      spaceId,
      agentId,
      rating,
      dimension: dimension ?? "quality",
      comment,
    });

    return { rating, comment };
  },
});
