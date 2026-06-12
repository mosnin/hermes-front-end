import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Dimensions for the embedding vectors used by Convex vector search.
// 1536 matches OpenAI text-embedding-3-small. If you swap the embedding
// model, update this and EMBEDDING_DIMENSIONS in convex/embeddings.ts.
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Hermes Control Plane schema.
 *
 * Everything is scoped by `ownerId`, which is a Clerk organization id for
 * enterprise/team accounts or a Clerk user id for individual (consumer)
 * accounts. See convex/lib/auth.ts (getOwnerId).
 *
 * Real-time reactivity comes for free from Convex queries. Semantic search is
 * powered by the `.vectorIndex(...)` declarations on `skills` and `messages`.
 */
export default defineSchema({
  // ---------------------------------------------------------------------------
  // Agents — a Hermes agent the user has deployed (AWS, local, anywhere) and
  // connected to the control plane via the Python connector.
  // ---------------------------------------------------------------------------
  agents: defineTable({
    ownerId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    // Where it runs, free-form: "aws", "local", "fly", "gcp", "render", ...
    platform: v.optional(v.string()),
    status: v.union(
      v.literal("online"),
      v.literal("offline"),
      v.literal("degraded"),
      v.literal("pending"),
    ),
    // SHA-256 hash of the connector token. The raw token is shown to the user
    // exactly once at registration time and never stored.
    tokenHash: v.string(),
    lastHeartbeat: v.optional(v.number()),
    connectorVersion: v.optional(v.string()),
    // Models/toolsets/skills the agent reports it can run.
    capabilities: v.optional(v.array(v.string())),
    tags: v.optional(v.array(v.string())),
    // Optional metadata reported by the connector (host, region, pid, ...).
    meta: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_token", ["tokenHash"]),

  // ---------------------------------------------------------------------------
  // Threads — a conversation / line of work with an agent.
  // ---------------------------------------------------------------------------
  threads: defineTable({
    ownerId: v.string(),
    agentId: v.optional(v.id("agents")),
    // Stable key the connector uses to map its local session to a thread.
    connectorKey: v.optional(v.string()),
    title: v.string(),
    summary: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("idle"),
      v.literal("archived"),
    ),
    pinned: v.optional(v.boolean()),
    lastMessageAt: v.optional(v.number()),
    messageCount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_agent", ["agentId"])
    .index("by_connector_key", ["agentId", "connectorKey"]),

  // ---------------------------------------------------------------------------
  // Messages — individual turns within a thread. Embeddable for semantic search.
  // ---------------------------------------------------------------------------
  messages: defineTable({
    ownerId: v.string(),
    threadId: v.id("threads"),
    agentId: v.optional(v.id("agents")),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
      v.literal("tool"),
    ),
    content: v.string(),
    // Structured tool calls / results, when present.
    toolCalls: v.optional(v.any()),
    embedding: v.optional(v.array(v.float64())),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_owner", ["ownerId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIMENSIONS,
      filterFields: ["ownerId"],
    }),

  // ---------------------------------------------------------------------------
  // Tasks — work items you can assign to agents and track on a board.
  // ---------------------------------------------------------------------------
  tasks: defineTable({
    ownerId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("blocked"),
      v.literal("done"),
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("urgent"),
    ),
    assigneeAgentId: v.optional(v.id("agents")),
    threadId: v.optional(v.id("threads")),
    // Lexicographic ordering key for drag-and-drop within a column.
    orderKey: v.string(),
    dueAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_assignee", ["assigneeAgentId"]),

  // ---------------------------------------------------------------------------
  // Skills — reusable instructions/context you can give to agents. Searchable.
  // ---------------------------------------------------------------------------
  skills: defineTable({
    ownerId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    // The skill body: a prompt, playbook, or set of instructions.
    content: v.string(),
    tags: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIMENSIONS,
      filterFields: ["ownerId"],
    }),

  // ---------------------------------------------------------------------------
  // Integrations — external connections (Slack, GitHub, calendars, ...).
  // ---------------------------------------------------------------------------
  integrations: defineTable({
    ownerId: v.string(),
    type: v.string(), // "slack" | "github" | "gmail" | "linear" | ...
    name: v.string(),
    status: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error"),
    ),
    // Non-secret config. Secrets should be referenced, not stored in plaintext.
    config: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  // ---------------------------------------------------------------------------
  // Activity — the live feed of everything agents do. Powers the dashboard.
  // ---------------------------------------------------------------------------
  activity: defineTable({
    ownerId: v.string(),
    agentId: v.optional(v.id("agents")),
    threadId: v.optional(v.id("threads")),
    // "message" | "tool_call" | "status" | "task" | "error" | "system" | ...
    type: v.string(),
    title: v.string(),
    detail: v.optional(v.string()),
    payload: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_time", ["ownerId", "createdAt"])
    .index("by_agent", ["agentId"])
    .index("by_thread", ["threadId"]),

  // ---------------------------------------------------------------------------
  // Orchestrations — multi-agent workflows (sequences/graphs of steps).
  // ---------------------------------------------------------------------------
  orchestrations: defineTable({
    ownerId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("running"),
      v.literal("paused"),
      v.literal("completed"),
    ),
    // Ordered steps; each step targets an agent and a prompt/task.
    steps: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        agentId: v.optional(v.id("agents")),
        instruction: v.string(),
        dependsOn: v.optional(v.array(v.string())),
        status: v.optional(
          v.union(
            v.literal("pending"),
            v.literal("running"),
            v.literal("done"),
            v.literal("failed"),
          ),
        ),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
});
