import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// NOTE: the write-back hook (`ingestFromCompletion`/`insertFromConnector`) is
// internal-only — there's no signed-in user in the connector path, so these
// tests exercise it the way http.ts (owned by another team) eventually will:
// via `t.action(internal.memories.ingestFromCompletion, ...)` after resolving
// a spaceId/agentId out-of-band. See the module comment in memories.ts for
// the cross-team wiring note (http.ts doesn't call this yet).
const modules = import.meta.glob("../**/*.*s");

describe("memories: write-back hook (feature 14)", () => {
  test("ingestFromCompletion stores a space-scoped memory tagged with its source", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_memwb" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "WriteBack" });
    const agentId = (
      await owner.action(api.agents.create, { spaceId, name: "Completer" })
    ).agentId as Id<"agents">;

    const memoryId = await t.action(internal.memories.ingestFromCompletion, {
      spaceId,
      agentId,
      title: "Task: reconcile invoices",
      content: "Reconciled 42 invoices; found 2 discrepancies totaling $130.50, both flagged for review.",
      sourceKind: "task",
      sourceId: "task_abc123",
      tags: ["finance", "automated"],
    });
    expect(memoryId).not.toBeNull();

    const memories = await owner.query(api.memories.list, { spaceId });
    const stored = memories.find((m) => m._id === memoryId);
    expect(stored).toBeDefined();
    expect(stored!.title).toBe("Task: reconcile invoices");
    expect(stored!.source).toBe("task");
    expect(stored!.spaceId).toBe(spaceId);
    expect(stored!.tags).toEqual(["finance", "automated"]);
  });

  test("ingestFromCompletion returns null for empty/whitespace content instead of storing a blank memory", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_memwb2" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "WriteBack2" });

    const result = await t.action(internal.memories.ingestFromCompletion, {
      spaceId,
      title: "Empty run",
      content: "   ",
    });
    expect(result).toBeNull();

    const memories = await owner.query(api.memories.list, { spaceId });
    expect(memories).toHaveLength(0);
  });

  test("without OPENAI_API_KEY, long content degrades gracefully to head-truncation rather than failing", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_memwb3" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "WriteBack3" });

    const longContent = "x".repeat(3000);
    const memoryId = await t.action(internal.memories.ingestFromCompletion, {
      spaceId,
      title: "Long run output",
      content: longContent,
    });
    expect(memoryId).not.toBeNull();

    const memories = await owner.query(api.memories.list, { spaceId });
    const stored = memories.find((m) => m._id === memoryId);
    expect(stored).toBeDefined();
    // Naive-truncation fallback caps at ~1200 chars + ellipsis, well short of
    // the full 3000-char input — proves the no-key path degrades rather than
    // storing (or choking on) the raw content.
    expect(stored!.content.length).toBeLessThan(1300);
    expect(stored!.content.endsWith("…")).toBe(true);
    // No embedding is computed without a key.
    expect(stored!.embedding).toBeUndefined();
  });

  test("short content passes through unsummarized", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_memwb4" });
    const spaceId = await owner.mutation(api.spaces.create, { name: "WriteBack4" });

    const memoryId = await t.action(internal.memories.ingestFromCompletion, {
      spaceId,
      title: "Short run",
      content: "Deployed v1.2.3 to production. No errors.",
    });
    const memories = await owner.query(api.memories.list, { spaceId });
    const stored = memories.find((m) => m._id === memoryId);
    expect(stored!.content).toBe("Deployed v1.2.3 to production. No errors.");
  });

  test("insertFromConnector rejects an agent that doesn't belong to the given Space", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_memwb5" });
    const spaceA = await owner.mutation(api.spaces.create, { name: "SpaceA" });
    const spaceB = await owner.mutation(api.spaces.create, { name: "SpaceB" });
    const agentInB = (
      await owner.action(api.agents.create, { spaceId: spaceB, name: "Foreign agent" })
    ).agentId as Id<"agents">;

    await expect(
      t.mutation(internal.memories.insertFromConnector, {
        spaceId: spaceA,
        agentId: agentInB,
        title: "Cross-space attempt",
        content: "should not be allowed",
        source: "connector",
      }),
    ).rejects.toThrow(/Agent not in Space/);
  });

  test("company-scoped memories from ingestFromCompletion-adjacent manual add are visible across Spaces in the same company", async () => {
    // Sanity check that the write-back path's `scope: "space"` default keeps
    // connector-ingested memories private to their originating Space, unlike
    // the existing `memories.add` action which can opt into "company" scope.
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_memwb6" });
    const spaceA = await owner.mutation(api.spaces.create, { name: "SpaceA6" });
    const spaceB = await owner.mutation(api.spaces.create, { name: "SpaceB6" });

    await t.action(internal.memories.ingestFromCompletion, {
      spaceId: spaceA,
      title: "Space A private note",
      content: "This should stay in Space A only.",
    });

    const inA = await owner.query(api.memories.list, { spaceId: spaceA });
    const inB = await owner.query(api.memories.list, { spaceId: spaceB });
    expect(inA.some((m) => m.title === "Space A private note")).toBe(true);
    expect(inB.some((m) => m.title === "Space A private note")).toBe(false);
  });
});
