import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";
import { recordUsage } from "./lib/metering";

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

// ---------------------------------------------------------------------------
// Cross-harness eval benchmarking (feature 13)
//
// A benchmark is a reusable prompt + rubric/expected-output. Running it
// launches one `evalRuns` row per agent, all sharing a `batchId`, so the
// evals page can render a cost-vs-quality comparison across harnesses/models.
//
// Execution note: Convex actions can't natively invoke an arbitrary remote
// harness/container — real per-harness execution is the connector runtime's
// job (owned by Team A/the connector). Until that dispatch path lands, this
// runs the benchmark prompt through OpenAI directly (same OPENAI_API_KEY
// dependency as autoEvaluate/embeddings elsewhere in this file), while still
// persisting each run tagged with the *agent's own declared* harness/model so
// the comparison table is meaningful once real per-harness execution is
// wired in — only the execution step needs to change, not the schema or UI.
// ---------------------------------------------------------------------------

// Rough OpenAI pricing (USD per token) used to estimate benchmark run cost.
// gpt-4o-mini: $0.15/1M input, $0.60/1M output.
const PRICE_PER_INPUT_TOKEN = 0.15 / 1_000_000;
const PRICE_PER_OUTPUT_TOKEN = 0.6 / 1_000_000;

export const createBenchmark = mutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    prompt: v.string(),
    rubric: v.optional(v.string()),
    expectedOutput: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"evalBenchmarks">> => {
    const scope = await resolveScope(ctx, args.spaceId);
    requireRole(scope, "operator");
    const now = Date.now();
    const id = await ctx.db.insert("evalBenchmarks", {
      companyId: scope.companyId,
      spaceId: args.spaceId,
      name: args.name,
      description: args.description,
      prompt: args.prompt,
      rubric: args.rubric,
      expectedOutput: args.expectedOutput,
      createdBy: scope.userId,
      createdAt: now,
      updatedAt: now,
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId: args.spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "system",
      action: "eval_benchmark_created",
      summary: `Created eval benchmark "${args.name}"`,
    });
    return id;
  },
});

export const listBenchmarks = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("evalBenchmarks")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(200);
  },
});

export const removeBenchmark = mutation({
  args: { spaceId: v.id("spaces"), benchmarkId: v.id("evalBenchmarks") },
  handler: async (ctx, { spaceId, benchmarkId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const row = await ctx.db.get(benchmarkId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(benchmarkId);
  },
});

/** Recent batches for a Space, newest first, with per-batch rollups. */
export const listBatches = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const runs = await ctx.db
      .query("evalRuns")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(500);
    const benchmarks = await ctx.db
      .query("evalBenchmarks")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const benchName = new Map(benchmarks.map((b) => [b._id, b.name]));

    const groups = new Map<string, Doc<"evalRuns">[]>();
    for (const r of runs) {
      const key = r.batchId ?? r._id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    return Array.from(groups.entries())
      .map(([batchId, rows]) => {
        const completed = rows.filter((r) => r.qualityScore != null);
        const avgQuality = completed.length
          ? completed.reduce((s, r) => s + (r.qualityScore ?? 0), 0) / completed.length
          : null;
        const totalCost = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
        return {
          batchId,
          benchmarkId: rows[0].benchmarkId,
          benchmarkName: benchName.get(rows[0].benchmarkId) ?? "Benchmark",
          runCount: rows.length,
          avgQuality,
          totalCostUsd: totalCost,
          startedAt: Math.min(...rows.map((r) => r.startedAt)),
          status: rows.some((r) => r.status === "running" || r.status === "pending")
            ? "running"
            : rows.some((r) => r.status === "failed")
              ? "partial"
              : "completed",
        };
      })
      .sort((a, b) => b.startedAt - a.startedAt);
  },
});

/** All runs in a batch, joined with agent name/harness for the comparison view. */
export const compareBatch = query({
  args: { spaceId: v.id("spaces"), batchId: v.string() },
  handler: async (ctx, { spaceId, batchId }) => {
    await resolveScope(ctx, spaceId);
    const runs = await ctx.db
      .query("evalRuns")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    const scoped = runs.filter((r) => r.spaceId === spaceId);
    const agents = await Promise.all(scoped.map((r) => ctx.db.get(r.agentId)));
    return scoped.map((r, i) => ({
      runId: r._id,
      agentId: r.agentId,
      agentName: agents[i]?.name ?? "Agent",
      harness: r.harness ?? agents[i]?.harness ?? "unknown",
      model: r.model ?? agents[i]?.model ?? "unknown",
      status: r.status,
      qualityScore: r.qualityScore ?? null,
      costUsd: r.costUsd ?? null,
      inputTokens: r.inputTokens ?? null,
      outputTokens: r.outputTokens ?? null,
      latencyMs: r.latencyMs ?? null,
      output: r.output,
      error: r.error,
    }));
  },
});

export const createBenchmarkRuns = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    benchmarkId: v.id("evalBenchmarks"),
    agentIds: v.array(v.id("agents")),
    userId: v.string(),
  },
  handler: async (ctx, { spaceId, benchmarkId, agentIds, userId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const bench = await ctx.db.get(benchmarkId);
    if (!bench || bench.spaceId !== spaceId) throw new Error("Benchmark not found");

    const batchId = crypto.randomUUID();
    const now = Date.now();
    const runIds: Id<"evalRuns">[] = [];
    for (const agentId of agentIds) {
      const agent = await ctx.db.get(agentId);
      if (!agent || agent.spaceId !== spaceId) continue;
      const runId = await ctx.db.insert("evalRuns", {
        companyId: scope.companyId,
        spaceId,
        benchmarkId,
        batchId,
        agentId,
        harness: agent.harness,
        model: agent.model,
        status: "pending",
        startedAt: now,
      });
      runIds.push(runId);
    }
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: userId,
      category: "system",
      action: "eval_batch_started",
      summary: `Started eval batch "${bench.name}" across ${runIds.length} agent(s)`,
      payload: { batchId, benchmarkId },
    });
    return { batchId, runIds, prompt: bench.prompt, rubric: bench.rubric, expectedOutput: bench.expectedOutput };
  },
});

export const finalizeRun = internalMutation({
  args: {
    runId: v.id("evalRuns"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    output: v.optional(v.string()),
    qualityScore: v.optional(v.number()),
    judge: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { runId, ...rest }) => {
    const run = await ctx.db.get(runId);
    if (!run) return;
    await ctx.db.patch(runId, { ...rest, finishedAt: Date.now() });
    if (rest.costUsd) {
      await recordUsage(ctx, {
        companyId: run.companyId,
        spaceId: run.spaceId,
        agentId: run.agentId,
        model: run.model,
        kind: "eval",
        costUsd: rest.costUsd,
        inputTokens: rest.inputTokens,
        outputTokens: rest.outputTokens,
      });
    }
  },
});

/**
 * Run a benchmark across N agents and persist per-run cost + quality. See the
 * module note above on the current execution stand-in.
 */
export const runBenchmarkBatch = action({
  args: {
    spaceId: v.id("spaces"),
    benchmarkId: v.id("evalBenchmarks"),
    agentIds: v.array(v.id("agents")),
  },
  handler: async (ctx, { spaceId, benchmarkId, agentIds }): Promise<{ batchId: string }> => {
    if (!agentIds.length) throw new Error("Select at least one agent");
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject ?? "system";

    const { batchId, runIds, prompt, rubric, expectedOutput } = await ctx.runMutation(
      internal.evals.createBenchmarkRuns,
      { spaceId, benchmarkId, agentIds, userId },
    );

    const key = process.env.OPENAI_API_KEY;
    await Promise.all(
      runIds.map(async (runId) => {
        const start = Date.now();
        if (!key) {
          await ctx.runMutation(internal.evals.finalizeRun, {
            runId,
            status: "failed",
            error: "OPENAI_API_KEY not configured — benchmark execution unavailable",
          });
          return;
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
              messages: [{ role: "user", content: prompt }],
              temperature: 0,
            }),
          });
          if (!res.ok) throw new Error(`OpenAI ${res.status}`);
          const data = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const output = data.choices?.[0]?.message?.content ?? "";
          const inputTokens = data.usage?.prompt_tokens ?? 0;
          const outputTokens = data.usage?.completion_tokens ?? 0;
          const costUsd =
            inputTokens * PRICE_PER_INPUT_TOKEN + outputTokens * PRICE_PER_OUTPUT_TOKEN;

          let qualityScore: number | undefined;
          try {
            const judgePrompt =
              `Rate how well this OUTPUT satisfies the PROMPT` +
              (rubric ? ` against this RUBRIC: ${rubric}` : "") +
              (expectedOutput ? ` (expected output for reference: ${expectedOutput})` : "") +
              `. Reply with ONLY a JSON object {"score": n} where n is 0..1.\n\nPROMPT:\n${prompt}\n\nOUTPUT:\n${output.slice(0, 6000)}`;
            const judgeRes = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: judgePrompt }],
                temperature: 0,
              }),
            });
            if (judgeRes.ok) {
              const judgeData = (await judgeRes.json()) as {
                choices?: { message?: { content?: string } }[];
              };
              const raw = judgeData.choices?.[0]?.message?.content ?? "";
              const match = raw.match(/\{[\s\S]*\}/);
              const parsed = JSON.parse(match ? match[0] : raw) as { score?: unknown };
              const n = Number(parsed.score);
              qualityScore = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : undefined;
            }
          } catch {
            qualityScore = undefined;
          }

          await ctx.runMutation(internal.evals.finalizeRun, {
            runId,
            status: "completed",
            output: output.slice(0, 8000),
            qualityScore,
            judge: qualityScore != null ? "llm" : undefined,
            costUsd,
            inputTokens,
            outputTokens,
            latencyMs: Date.now() - start,
          });
        } catch (e) {
          await ctx.runMutation(internal.evals.finalizeRun, {
            runId,
            status: "failed",
            error: e instanceof Error ? e.message : "Benchmark run failed",
            latencyMs: Date.now() - start,
          });
        }
      }),
    );

    return { batchId };
  },
});
