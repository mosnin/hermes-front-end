import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveScope } from "./lib/auth";

type Hit = { id: string; label: string; sub?: string };

/** Lightweight cross-entity search for the command palette. */
export const global = query({
  args: { spaceId: v.id("spaces"), query: v.string() },
  handler: async (ctx, { spaceId, query: q }) => {
    await resolveScope(ctx, spaceId);
    const needle = q.trim().toLowerCase();
    const empty = {
      agents: [] as Hit[],
      threads: [] as Hit[],
      tasks: [] as Hit[],
      skills: [] as Hit[],
      workflows: [] as Hit[],
      memories: [] as Hit[],
    };
    if (needle.length < 2) return empty;

    const take = <T>(rows: T[]) => rows.slice(0, 5);
    const has = (s: string | undefined) =>
      (s ?? "").toLowerCase().includes(needle);

    const [agents, threads, tasks, skills, workflows, memories] = await Promise.all([
      ctx.db.query("agents").withIndex("by_space", (i) => i.eq("spaceId", spaceId)).collect(),
      ctx.db.query("threads").withIndex("by_space", (i) => i.eq("spaceId", spaceId)).collect(),
      ctx.db.query("tasks").withIndex("by_space", (i) => i.eq("spaceId", spaceId)).collect(),
      ctx.db.query("skills").withIndex("by_space", (i) => i.eq("spaceId", spaceId)).collect(),
      ctx.db.query("workflows").withIndex("by_space", (i) => i.eq("spaceId", spaceId)).collect(),
      ctx.db.query("memories").withIndex("by_space", (i) => i.eq("spaceId", spaceId)).collect(),
    ]);

    return {
      agents: take(agents.filter((a) => has(a.name)).map((a) => ({ id: a._id, label: a.name, sub: a.platform }))),
      threads: take(threads.filter((t) => has(t.title)).map((t) => ({ id: t._id, label: t.title }))),
      tasks: take(tasks.filter((t) => has(t.title)).map((t) => ({ id: t._id, label: t.title, sub: t.status }))),
      skills: take(skills.filter((s) => has(s.name)).map((s) => ({ id: s._id, label: s.name }))),
      workflows: take(workflows.filter((w) => has(w.name)).map((w) => ({ id: w._id, label: w.name }))),
      memories: take(memories.filter((m) => has(m.title)).map((m) => ({ id: m._id, label: m.title, sub: m.scope }))),
    };
  },
});
