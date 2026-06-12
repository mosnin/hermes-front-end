import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Embedding dimensions for Convex vector search (OpenAI text-embedding-3-small).
export const EMBEDDING_DIMENSIONS = 1536;

// Reusable validators -------------------------------------------------------
export const roleValidator = v.union(
  v.literal("viewer"),
  v.literal("operator"),
  v.literal("admin"),
  v.literal("owner"),
);

// Per-Space guardrails that keep autonomy safe without human-in-the-loop.
export const guardConfigValidator = v.object({
  maxStepsPerRun: v.number(),
  maxAgentHops: v.number(),
  maxConcurrentRuns: v.number(),
  maxRunWallclockMs: v.number(),
  dailyMessageBudget: v.number(),
  maxLoopRepeats: v.number(),
});

export const DEFAULT_GUARD_CONFIG = {
  maxStepsPerRun: 50,
  maxAgentHops: 25,
  maxConcurrentRuns: 10,
  maxRunWallclockMs: 60 * 60 * 1000, // 1 hour
  dailyMessageBudget: 5000,
  maxLoopRepeats: 4,
};

/**
 * Hermes Control Plane — enterprise schema for an autonomous-company hub.
 *
 * Tenancy: Company (Clerk org/user) → Space (operating unit) → Squad.
 * Every domain row carries companyId + spaceId. Reads scope by spaceId after a
 * membership check; analytics roll up by companyId. See convex/lib/auth.ts.
 */
export default defineSchema({
  // ===========================================================================
  // Org structure
  // ===========================================================================
  spaces: defineTable({
    companyId: v.string(),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    createdBy: v.string(),
    // Master kill switch: when true, all autonomous dispatch is halted.
    autonomyPaused: v.optional(v.boolean()),
    guardConfig: v.optional(guardConfigValidator),
    createdAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_company_slug", ["companyId", "slug"]),

  squads: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_space", ["spaceId"]),

  spaceMembers: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    userId: v.string(),
    role: roleValidator,
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_user", ["spaceId", "userId"])
    .index("by_user", ["userId"]),

  // ===========================================================================
  // Agents
  // ===========================================================================
  agents: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    squadId: v.optional(v.id("squads")),
    name: v.string(),
    description: v.optional(v.string()),
    platform: v.optional(v.string()),
    // "hermes" (connector) or "a2a-external" (remote A2A agent by card URL).
    kind: v.optional(v.union(v.literal("hermes"), v.literal("a2a-external"))),
    status: v.union(
      v.literal("online"),
      v.literal("offline"),
      v.literal("degraded"),
      v.literal("pending"),
    ),
    tokenHash: v.optional(v.string()),
    // For external A2A agents: their Agent Card URL + declared skills.
    cardUrl: v.optional(v.string()),
    lastHeartbeat: v.optional(v.number()),
    connectorVersion: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    tags: v.optional(v.array(v.string())),
    meta: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_status", ["spaceId", "status"])
    .index("by_squad", ["squadId"])
    .index("by_token", ["tokenHash"]),

  // ===========================================================================
  // Conversations
  // ===========================================================================
  threads: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    agentId: v.optional(v.id("agents")),
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
    .index("by_space", ["spaceId"])
    .index("by_space_status", ["spaceId", "status"])
    .index("by_agent", ["agentId"])
    .index("by_connector_key", ["agentId", "connectorKey"]),

  messages: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    threadId: v.id("threads"),
    agentId: v.optional(v.id("agents")),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
      v.literal("tool"),
    ),
    content: v.string(),
    toolCalls: v.optional(v.any()),
    embedding: v.optional(v.array(v.float64())),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_space", ["spaceId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIMENSIONS,
      filterFields: ["spaceId"],
    }),

  // ===========================================================================
  // Work: goals → projects → tasks
  // ===========================================================================
  goals: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("at_risk"),
      v.literal("done"),
      v.literal("archived"),
    ),
    progress: v.optional(v.number()), // 0..1
    targetDate: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_space", ["spaceId"]),

  projects: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    goalId: v.optional(v.id("goals")),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("done"),
      v.literal("archived"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_goal", ["goalId"]),

  tasks: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    squadId: v.optional(v.id("squads")),
    projectId: v.optional(v.id("projects")),
    goalId: v.optional(v.id("goals")),
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
    workflowRunId: v.optional(v.id("workflowRuns")),
    orderKey: v.string(),
    dueAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_status", ["spaceId", "status"])
    .index("by_assignee", ["assigneeAgentId"])
    .index("by_project", ["projectId"]),

  // ===========================================================================
  // Coordination: A2A + workflows
  // ===========================================================================
  a2aMessages: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    fromAgentId: v.id("agents"),
    toAgentId: v.id("agents"),
    threadId: v.optional(v.id("threads")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    kind: v.union(
      v.literal("message"),
      v.literal("task"),
      v.literal("status"),
      v.literal("artifact"),
    ),
    content: v.string(),
    payload: v.optional(v.any()),
    status: v.union(
      v.literal("queued"),
      v.literal("delivered"),
      v.literal("read"),
    ),
    createdAt: v.number(),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_time", ["spaceId", "createdAt"])
    .index("by_recipient_status", ["toAgentId", "status"])
    .index("by_thread", ["threadId"]),

  workflows: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    enabled: v.boolean(),
    // Ordered/DAG steps. dependsOn references step ids.
    steps: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        agentId: v.optional(v.id("agents")),
        // Resolve an agent by capability if no explicit agentId.
        requiresCapability: v.optional(v.string()),
        instruction: v.string(),
        dependsOn: v.optional(v.array(v.string())),
        maxAttempts: v.optional(v.number()),
        timeoutMs: v.optional(v.number()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_space", ["spaceId"]),

  workflowRuns: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    workflowId: v.id("workflows"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("killed"),
    ),
    trigger: v.optional(v.string()), // "manual" | "schedule" | "webhook" | "event"
    input: v.optional(v.any()),
    hops: v.number(), // agent hops consumed (runaway guard)
    stepsDone: v.number(),
    error: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_status", ["spaceId", "status"])
    .index("by_workflow", ["workflowId"]),

  runSteps: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    workflowRunId: v.id("workflowRuns"),
    stepId: v.string(),
    index: v.number(),
    name: v.string(),
    agentId: v.optional(v.id("agents")),
    instruction: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("dispatched"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    attempts: v.number(),
    output: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_run", ["workflowRunId"])
    .index("by_agent_status", ["agentId", "status"]),

  triggers: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    workflowId: v.id("workflows"),
    kind: v.union(
      v.literal("schedule"),
      v.literal("webhook"),
      v.literal("event"),
    ),
    cron: v.optional(v.string()),
    nextRunAt: v.optional(v.number()),
    webhookSecret: v.optional(v.string()),
    eventType: v.optional(v.string()),
    enabled: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_workflow", ["workflowId"])
    .index("by_due", ["enabled", "nextRunAt"]),

  // ===========================================================================
  // Knowledge: skills + context engine
  // ===========================================================================
  skills: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIMENSIONS,
      filterFields: ["spaceId"],
    }),

  memories: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    // "space" memories are private to the Space; "company" memories are shared.
    scope: v.union(v.literal("space"), v.literal("company")),
    source: v.string(), // "thread" | "artifact" | "integration" | "manual" | ...
    title: v.string(),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_company", ["companyId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIMENSIONS,
      filterFields: ["spaceId", "companyId", "scope"],
    }),

  // ===========================================================================
  // Record: durable audit/history, artifacts, reports, usage, activity
  // ===========================================================================
  // Immutable, queryable record of everything that happened. The source of
  // truth for "what got done". Never updated, only appended.
  workEvents: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    actorType: v.union(
      v.literal("agent"),
      v.literal("user"),
      v.literal("system"),
      v.literal("workflow"),
    ),
    actorId: v.optional(v.string()),
    agentId: v.optional(v.id("agents")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    category: v.string(), // task|message|a2a|workflow|integration|governance|artifact
    action: v.string(),
    summary: v.string(),
    payload: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_space_time", ["spaceId", "createdAt"])
    .index("by_company_time", ["companyId", "createdAt"])
    .index("by_agent", ["agentId"])
    .index("by_run", ["workflowRunId"]),

  artifacts: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    agentId: v.optional(v.id("agents")),
    threadId: v.optional(v.id("threads")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    name: v.string(),
    kind: v.union(v.literal("file"), v.literal("text"), v.literal("link")),
    storageId: v.optional(v.id("_storage")),
    url: v.optional(v.string()),
    text: v.optional(v.string()),
    mime: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_run", ["workflowRunId"]),

  reports: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    kind: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("custom"),
    ),
    periodStart: v.number(),
    periodEnd: v.number(),
    title: v.string(),
    summary: v.string(),
    metrics: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_space_time", ["spaceId", "createdAt"]),

  usage: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    agentId: v.optional(v.id("agents")),
    model: v.optional(v.string()),
    kind: v.string(), // "tokens" | "message" | "run"
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_space_time", ["spaceId", "createdAt"])
    .index("by_company_time", ["companyId", "createdAt"]),

  activity: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    agentId: v.optional(v.id("agents")),
    threadId: v.optional(v.id("threads")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    type: v.string(),
    title: v.string(),
    detail: v.optional(v.string()),
    payload: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_time", ["spaceId", "createdAt"])
    .index("by_agent", ["agentId"])
    .index("by_thread", ["threadId"]),

  // ===========================================================================
  // External access
  // ===========================================================================
  integrations: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    type: v.string(),
    name: v.string(),
    status: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error"),
    ),
    config: v.optional(v.any()),
    // Reference to a secret stored out-of-band; never the raw secret.
    secretRef: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_space", ["spaceId"]),
});
