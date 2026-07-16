import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { assertAutonomyActive } from "./lib/guards";

type PlannedStep = { name: string; instruction: string };

/**
 * Decompose a goal into ordered autonomous-agent steps.
 *
 * Uses OpenAI (gpt-4o-mini) when OPENAI_API_KEY is set in the Convex
 * environment; otherwise (or on any failure) falls back to a deterministic
 * heuristic decomposition so planning always produces a runnable workflow.
 */
async function decompose(goal: string): Promise<PlannedStep[]> {
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You are a planner that decomposes a high-level goal into 3-6 ordered, " +
                "self-contained steps for autonomous AI agents to execute in sequence. " +
                'Respond with ONLY a JSON array of objects shaped {"name": string, "instruction": string}. ' +
                "Each name is a short title; each instruction is a concrete, actionable directive for an agent. " +
                "No prose, no markdown fences.",
            },
            { role: "user", content: `Goal: ${goal}` },
          ],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content;
        const parsed = content ? parseSteps(content) : null;
        if (parsed && parsed.length >= 1) return parsed.slice(0, 6);
      }
    } catch {
      // fall through to heuristic
    }
  }
  return heuristic(goal);
}

/** Robustly parse a JSON array of steps out of an LLM response. */
function parseSteps(raw: string): PlannedStep[] | null {
  let text = raw.trim();
  // Strip markdown code fences if present.
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  // Isolate the first JSON array.
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  try {
    const data = JSON.parse(text) as unknown;
    if (!Array.isArray(data)) return null;
    const steps: PlannedStep[] = [];
    for (const item of data) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const name = typeof obj.name === "string" ? obj.name.trim() : "";
        const instruction =
          typeof obj.instruction === "string" ? obj.instruction.trim() : "";
        if (name || instruction) {
          steps.push({
            name: name || instruction.slice(0, 48) || "Step",
            instruction: instruction || name,
          });
        }
      }
    }
    return steps.length ? steps : null;
  } catch {
    return null;
  }
}

/** Deterministic fallback decomposition tailored with the goal text. */
function heuristic(goal: string): PlannedStep[] {
  const g = goal.trim();
  return [
    {
      name: "Research",
      instruction: `Gather the context, constraints, and information needed to achieve the goal: "${g}".`,
    },
    {
      name: "Draft",
      instruction: `Produce a first concrete draft of the work that advances the goal: "${g}", based on the research.`,
    },
    {
      name: "Review",
      instruction: `Critically review the draft for quality, correctness, and gaps relative to the goal: "${g}", and revise it.`,
    },
    {
      name: "Execute",
      instruction: `Carry out the reviewed plan and take the actions required to deliver on the goal: "${g}".`,
    },
    {
      name: "Summarize",
      instruction: `Summarize the outcome, results, and any follow-ups for the goal: "${g}".`,
    },
  ];
}

export const plan = action({
  args: {
    spaceId: v.id("spaces"),
    goal: v.string(),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    workflowId: Id<"workflows">;
    steps: { name: string; instruction: string }[];
  }> => {
    const steps = await decompose(args.goal);
    const workflowId = await ctx.runMutation(internal.planner.createPlanned, {
      spaceId: args.spaceId,
      goal: args.goal,
      agentId: args.agentId,
      steps,
    });
    return {
      workflowId,
      steps: steps.map((s) => ({ name: s.name, instruction: s.instruction })),
    };
  },
});

export const createPlanned = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    goal: v.string(),
    agentId: v.optional(v.id("agents")),
    steps: v.array(
      v.object({ name: v.string(), instruction: v.string() }),
    ),
  },
  handler: async (ctx, { spaceId, goal, agentId, steps }): Promise<Id<"workflows">> => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    assertAutonomyActive(scope);

    const now = Date.now();
    const built = steps.map((s, i) => ({
      id: `step-${i + 1}`,
      name: s.name,
      agentId,
      instruction: s.instruction,
      dependsOn: i > 0 ? [`step-${i}`] : undefined,
    }));

    const name = goal.length > 80 ? `${goal.slice(0, 77)}...` : goal;

    return await ctx.db.insert("workflows", {
      companyId: scope.companyId,
      spaceId,
      name,
      description: "Auto-planned from goal",
      enabled: true,
      steps: built,
      createdAt: now,
      updatedAt: now,
    });
  },
});
