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
  // Ops & scale (optional so existing Spaces stay valid):
  maxMessagesPerMinute: v.optional(v.number()),
  // 0 / unset = unlimited. When exceeded, autonomy auto-pauses.
  monthlyBudgetUsd: v.optional(v.number()),
});

// Desired/applied runtime config for remote config push (feature 7). The
// control plane writes pendingConfig; the connector polls, applies, and acks —
// at which point the same shape is copied into appliedConfig. Drift = version
// mismatch between the two.
export const agentRuntimeConfigValidator = v.object({
  version: v.number(),
  model: v.optional(v.string()),
  systemPrompt: v.optional(v.string()),
  toolAllowlist: v.optional(v.array(v.string())),
  envOverrides: v.optional(v.record(v.string(), v.string())),
  updatedBy: v.optional(v.string()),
  updatedAt: v.number(),
});

// Squad-level autoscaling policy (feature 8), evaluated by a cron-safe
// internal function in agentOps.ts.
export const squadAutoscaleValidator = v.object({
  enabled: v.boolean(),
  minAgents: v.number(),
  maxAgents: v.number(),
  // Scale up when (queued tasks / online agents) exceeds this.
  queueDepthPerAgent: v.number(),
  cooldownMinutes: v.number(),
  // Template used to stamp out new agents on scale-up.
  templateId: v.optional(v.id("agentTemplates")),
  harness: v.optional(v.string()),
  lastScaleAt: v.optional(v.number()),
  lastScaleDirection: v.optional(v.string()), // "up" | "down"
  lastEvaluatedAt: v.optional(v.number()),
});

export const DEFAULT_GUARD_CONFIG = {
  maxStepsPerRun: 50,
  maxAgentHops: 25,
  maxConcurrentRuns: 10,
  maxRunWallclockMs: 60 * 60 * 1000, // 1 hour
  dailyMessageBudget: 5000,
  maxLoopRepeats: 4,
  maxMessagesPerMinute: 120,
  monthlyBudgetUsd: 0,
};

/**
 * Cadre — enterprise schema for an autonomous-company hub.
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
    // Shadow mode: agents PROPOSE actions instead of executing them.
    shadowMode: v.optional(v.boolean()),
    // Billing plan tier for this Space.
    plan: v.optional(v.string()), // "free" | "team" | "enterprise"
    // Model router policy: { primary, fallbacks[], byCapability? }.
    modelPolicy: v.optional(v.any()),
    // A2A federation groundwork (feature 15): when true, agents in this Space
    // with publishedToDirectory=true appear in the public agent directory.
    directoryEnabled: v.optional(v.boolean()),
    // Cost controls (feature 18): idle hibernation + hard spend cap.
    costPolicy: v.optional(
      v.object({
        hibernationEnabled: v.optional(v.boolean()),
        // Mark hosted agents idle after N minutes without work events.
        idleHibernateMinutes: v.optional(v.number()),
        // Hard monthly cap (USD); on breach hosted VMs are stopped, not just
        // autonomy paused. 0/unset = no hard cap.
        hardCapUsd: v.optional(v.number()),
        hardCapAction: v.optional(v.string()), // "pause" | "stop_vms"
      }),
    ),
    guardConfig: v.optional(guardConfigValidator),
    // Scheduled active window (business-hours autonomy). Outside the window,
    // autonomous dispatch is refused — evaluated at guard time, no cron needed.
    // Minutes are from local midnight; tzOffsetMinutes shifts UTC to the
    // operator's zone (e.g. -300 for US Eastern). days: 0=Sun … 6=Sat.
    schedule: v.optional(
      v.object({
        enabled: v.boolean(),
        days: v.array(v.number()),
        startMin: v.number(),
        endMin: v.number(),
        tzOffsetMinutes: v.number(),
      }),
    ),
    createdAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_company_slug", ["companyId", "slug"]),

  squads: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    // Autoscaling (feature 8): min/max + queue-depth rule; see
    // squadAutoscaleValidator.
    autoscale: v.optional(squadAutoscaleValidator),
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
    // Agent framework the runtime wraps: "hermes" | "openclaw" | "goose" |
    // "cli" (any command-line agent) | custom. Purely informational routing —
    // the connector protocol is framework-agnostic.
    framework: v.optional(v.string()),
    // "hermes" (connector) or "a2a-external" (remote A2A agent by card URL).
    kind: v.optional(v.union(v.literal("hermes"), v.literal("a2a-external"))),
    status: v.union(
      v.literal("online"),
      v.literal("offline"),
      v.literal("degraded"),
      v.literal("pending"),
    ),
    tokenHash: v.optional(v.string()),
    // SHA-256 of the inbound A2A key that external A2A clients present to call
    // this agent's JSON-RPC endpoint. Set via agents.rotateInboundKey.
    a2aInboundKeyHash: v.optional(v.string()),
    // --- Persona / config (what the agent is + how it runs) ---
    systemPrompt: v.optional(v.string()),
    model: v.optional(v.string()),
    modelProvider: v.optional(v.string()),
    toolsets: v.optional(v.array(v.string())),
    // --- Hierarchy: which agent this one reports to (org chart) ---
    reportsTo: v.optional(v.id("agents")),
    // --- Fleet: cloud VM this agent runs on (one-click deploy) ---
    vmProvider: v.optional(v.string()), // "cloudflare" | "fly" | "aws" | ...
    vmId: v.optional(v.string()),
    region: v.optional(v.string()),
    deploymentStatus: v.optional(
      v.union(
        v.literal("provisioning"),
        v.literal("running"),
        v.literal("stopped"),
        v.literal("failed"),
      ),
    ),
    // For external A2A agents: their Agent Card URL + declared skills.
    cardUrl: v.optional(v.string()),
    lastHeartbeat: v.optional(v.number()),
    connectorVersion: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    tags: v.optional(v.array(v.string())),
    meta: v.optional(v.any()),
    // --- Harness-agnostic runtime (features 1,3,5) ---
    // Which harness runtime image this hosted agent boots:
    // "hermes" | "openclaw" | "goose" | "generic-cli" | "custom".
    harness: v.optional(v.string()),
    harnessVersion: v.optional(v.string()),
    // BYO-image (enterprise-gated): arbitrary container image ref passed to
    // /spawn instead of a curated per-harness image.
    imageRef: v.optional(v.string()),
    // Set when a rolling restart has been requested but not yet performed
    // (drained agents are skipped until their running tasks finish).
    restartRequestedAt: v.optional(v.number()),
    // --- Remote config push (feature 7): desired vs applied ---
    pendingConfig: v.optional(agentRuntimeConfigValidator),
    appliedConfig: v.optional(agentRuntimeConfigValidator),
    configAckedAt: v.optional(v.number()),
    // --- Security profile link (feature 17) ---
    securityProfileId: v.optional(v.id("securityProfiles")),
    // --- Marketplace provenance / cloning (features 9,16) ---
    templateId: v.optional(v.id("agentTemplates")),
    // --- Idle / hibernation (feature 18) ---
    // Last time this agent produced a work event (maintained by health sweep).
    lastWorkAt: v.optional(v.number()),
    idleState: v.optional(
      v.union(
        v.literal("active"),
        v.literal("idle"),
        v.literal("hibernated"),
      ),
    ),
    hibernatedAt: v.optional(v.number()),
    // Opt this agent out of idle hibernation.
    hibernationExempt: v.optional(v.boolean()),
    // Per-agent hard spend cap in USD (0/unset = space policy only).
    spendCapUsd: v.optional(v.number()),
    // Revenue attributed to this agent (manual/import) for P&L (feature 18).
    attributedRevenueUsd: v.optional(v.number()),
    // --- Self-healing watchdog (feature 10): exponential backoff ---
    restartAttempts: v.optional(v.number()),
    lastRestartAt: v.optional(v.number()),
    nextRestartAt: v.optional(v.number()),
    watchdogDisabled: v.optional(v.boolean()),
    // --- A2A federation (feature 15): publish this agent's card to the
    // public directory (only effective when the Space's directoryEnabled).
    publishedToDirectory: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_status", ["spaceId", "status"])
    .index("by_squad", ["squadId"])
    .index("by_token", ["tokenHash"])
    .index("by_directory", ["publishedToDirectory"])
    .index("by_space_idle", ["spaceId", "idleState"]),

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
    // Capability-based routing (feature 11): capability tags this task needs
    // (e.g. "code-gen", "browser"); the router scores agents against these.
    requiredCapabilities: v.optional(v.array(v.string())),
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
    // Delivery lifecycle (at-least-once): queued → delivered (claimed by the
    // transport) → acked (recipient confirmed processing). A delivered-but-
    // unacked message is requeued by the redelivery sweep; after too many
    // attempts it's marked expired and dead-lettered. "read" is kept for
    // backward compatibility with older rows.
    status: v.union(
      v.literal("queued"),
      v.literal("delivered"),
      v.literal("acked"),
      v.literal("read"),
      v.literal("expired"),
    ),
    createdAt: v.number(),
    deliveredAt: v.optional(v.number()),
    ackedAt: v.optional(v.number()),
    redeliveries: v.optional(v.number()),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_time", ["spaceId", "createdAt"])
    .index("by_recipient_status", ["toAgentId", "status"])
    .index("by_status_delivered", ["status", "deliveredAt"])
    .index("by_thread", ["threadId"]),

  workflows: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    enabled: v.boolean(),
    // Require a human approval before this workflow's runs dispatch.
    requiresApproval: v.optional(v.boolean()),
    // Ordered/DAG steps. dependsOn references step ids.
    steps: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        agentId: v.optional(v.id("agents")),
        // Resolve an agent by capability if no explicit agentId.
        requiresCapability: v.optional(v.string()),
        // Capability-based routing (feature 11): multi-tag needs; superset of
        // requiresCapability (kept for back-compat).
        requiredCapabilities: v.optional(v.array(v.string())),
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
      v.literal("awaiting_approval"),
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
    .index("by_status_started", ["status", "startedAt"])
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

  // ===========================================================================
  // Secrets vault — credentials agents/integrations use (value never returned
  // in lists; only a masked preview).
  // ===========================================================================
  secrets: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    name: v.string(),
    value: v.string(),
    preview: v.string(), // masked, safe to display
    createdBy: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_name", ["spaceId", "name"]),

  // ===========================================================================
  // Chat bridges — control agents from Slack / Telegram / Discord.
  // ===========================================================================
  bridges: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    type: v.string(), // "slack" | "telegram" | "discord"
    name: v.string(),
    status: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error"),
    ),
    config: v.optional(v.any()),
    agentId: v.optional(v.id("agents")), // which agent messages route to
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_space", ["spaceId"]),

  // ===========================================================================
  // Quality: agent evaluations / scorecards.
  // ===========================================================================
  evals: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    threadId: v.optional(v.id("threads")),
    rating: v.number(), // 1..5 (or 1 = thumbs up, 0 = thumbs down)
    dimension: v.optional(v.string()), // "quality" | "speed" | "cost" | ...
    comment: v.optional(v.string()),
    source: v.optional(v.string()), // "human" | "auto" | "llm-judge"
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_agent", ["agentId"]),

  // ===========================================================================
  // Developer platform: API keys to drive the control plane programmatically.
  // ===========================================================================
  apiKeys: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    name: v.string(),
    keyHash: v.string(),
    prefix: v.string(), // first chars, for display
    createdBy: v.string(),
    lastUsedAt: v.optional(v.number()),
    // Public API v1 (feature 20): optional scoping + limits.
    scopes: v.optional(v.array(v.string())), // "read" | "write" | "deploy" | ...
    rateLimitPerMinute: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    revoked: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_hash", ["keyHash"]),

  // ===========================================================================
  // Trust: action ledger — every external action an agent takes or proposes,
  // with reversibility for rollback. Source of truth for "what agents did".
  // ===========================================================================
  actionLedger: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    agentId: v.optional(v.id("agents")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    action: v.string(),
    target: v.optional(v.string()),
    status: v.union(
      v.literal("proposed"),
      v.literal("executed"),
      v.literal("reverted"),
      v.literal("blocked"),
    ),
    reversible: v.optional(v.boolean()),
    payload: v.optional(v.any()),
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_time", ["spaceId", "createdAt"])
    .index("by_space_status", ["spaceId", "status"]),

  // ===========================================================================
  // Notifications — in-app alerts surfaced in the bell + notifications page.
  // ===========================================================================
  notifications: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    type: v.string(), // "alert" | "approval" | "run" | "agent" | "system" | ...
    title: v.string(),
    body: v.optional(v.string()),
    href: v.optional(v.string()),
    read: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_time", ["spaceId", "createdAt"])
    .index("by_space_read", ["spaceId", "read"]),

  // ===========================================================================
  // Governance: approval requests (human-in-the-loop gates, off by default)
  // ===========================================================================
  approvals: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    workflowRunId: v.optional(v.id("workflowRuns")),
    agentId: v.optional(v.id("agents")),
    kind: v.string(), // "action" | "spend" | "tool" | "workflow" | ...
    title: v.string(),
    detail: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    requestedBy: v.optional(v.string()),
    decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    payload: v.optional(v.any()),
    // Approval inbox everywhere (feature 19):
    // Structured preview/diff of the pending action for richer UI.
    preview: v.optional(v.any()),
    riskLevel: v.optional(v.string()), // "low" | "medium" | "high"
    // Channels this approval was pushed to ("email" | "webhook" | "in_app").
    deliveredChannels: v.optional(v.array(v.string())),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_status", ["spaceId", "status"]),

  // ===========================================================================
  // MCP servers — existing MCP endpoints agents can use (contact lookup,
  // AgentMail, MiniChat, Calendly, etc.).
  // ===========================================================================
  mcpServers: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    name: v.string(),
    url: v.string(),
    transport: v.union(v.literal("sse"), v.literal("http"), v.literal("stdio")),
    authHeader: v.optional(v.string()),
    scope: v.union(v.literal("space"), v.literal("agent")),
    agentId: v.optional(v.id("agents")),
    status: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error"),
    ),
    tools: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_agent", ["agentId"]),

  // ===========================================================================
  // Campaigns — ongoing jobs (the core use case): a standing objective agents
  // pursue continuously (e.g. outreach), with progress metrics.
  // ===========================================================================
  campaigns: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    name: v.string(),
    objective: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
    ),
    agentId: v.optional(v.id("agents")),
    cadence: v.optional(v.string()),
    nextRunAt: v.optional(v.number()),
    metrics: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_due", ["status", "nextRunAt"]),

  // ===========================================================================
  // Stream chunks — real-time token streaming for agent replies (a buffered
  // chunk is far cheaper than one DB write per token).
  // ===========================================================================
  streamChunks: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    threadId: v.id("threads"),
    streamId: v.string(),
    seq: v.number(),
    text: v.string(),
    done: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_stream", ["streamId", "seq"])
    .index("by_time", ["createdAt"]),

  // ===========================================================================
  // Dead-letter queue — failed workflow steps/runs captured with enough context
  // to inspect and replay, instead of vanishing into a "failed" run. Every
  // terminal failure writes one row; operators can replay from the Ops page.
  // ===========================================================================
  deadLetters: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    kind: v.string(), // "step" | "run" | "stuck_run"
    workflowId: v.optional(v.id("workflows")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    stepId: v.optional(v.string()),
    agentId: v.optional(v.id("agents")),
    error: v.string(),
    attempts: v.optional(v.number()),
    payload: v.optional(v.any()),
    status: v.union(
      v.literal("open"),
      v.literal("replayed"),
      v.literal("dismissed"),
    ),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_status", ["spaceId", "status"])
    .index("by_space_time", ["spaceId", "createdAt"]),

  // ===========================================================================
  // Structured error capture — every autonomous failure lands here with a trace
  // id so operators have real observability (not just an activity feed). Indexed
  // by space+time for the Ops error stream and by trace id to correlate a single
  // request across the connector → HTTP → workflow hops.
  // ===========================================================================
  errors: defineTable({
    companyId: v.string(),
    spaceId: v.optional(v.id("spaces")),
    traceId: v.string(),
    source: v.string(), // "a2a" | "connector" | "workflow" | "bridge" | ...
    agentId: v.optional(v.id("agents")),
    kind: v.string(), // "guard_violation" | "exception" | "delivery_failed"
    message: v.string(),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_space_time", ["spaceId", "createdAt"])
    .index("by_trace", ["traceId"])
    .index("by_time", ["createdAt"]),

  // ===========================================================================
  // Alert rules — condition → route. Ops teams get paged when the fleet
  // misbehaves (error spikes, budget burn, agents dropping, SLO breach) without
  // watching a dashboard. Evaluated by the "alert eval" cron.
  // ===========================================================================
  alertRules: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    name: v.string(),
    metric: v.string(), // errors_24h | budget_pct | agents_offline | run_success_rate | dead_letters_open | a2a_rate
    comparator: v.union(v.literal("gt"), v.literal("lt")),
    threshold: v.number(),
    channel: v.string(), // "notification" | "bridge"
    bridgeId: v.optional(v.id("bridges")),
    enabled: v.boolean(),
    cooldownMinutes: v.number(),
    lastFiredAt: v.optional(v.number()),
    lastValue: v.optional(v.number()),
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_enabled", ["enabled"]),

  // ===========================================================================
  // Platform admin audit — append-only record of every privileged platform
  // (super-admin) action. SOC2 CC6/CC7: privileged access is least-privilege,
  // logged, and attributable. There are intentionally NO update/delete
  // functions for this table anywhere in the codebase.
  // ===========================================================================
  adminAudit: defineTable({
    adminId: v.string(), // Clerk subject of the platform admin
    adminEmail: v.optional(v.string()),
    action: v.string(), // "view" | "global_pause" | "impersonate_start" | ...
    resource: v.optional(v.string()), // what was acted on
    target: v.optional(v.string()), // companyId / spaceId / userId affected
    detail: v.optional(v.string()),
    severity: v.optional(v.string()), // "info" | "warning" | "critical"
    createdAt: v.number(),
  })
    .index("by_time", ["createdAt"])
    .index("by_admin", ["adminId"]),

  // ===========================================================================
  // Platform-wide flags (global kill switch, maintenance). Singleton-ish: one
  // row keyed by `key`. Changing any flag is admin-audited.
  // ===========================================================================
  platformFlags: defineTable({
    key: v.string(), // "global_autonomy_paused" | "maintenance_mode"
    enabled: v.boolean(),
    updatedBy: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // ===========================================================================
  // Idempotency keys — dedupe retried connector ingestion (a network blip after
  // the server already processed a POST must not double-write). One row per
  // (agent, key); handlers check-and-set before acting.
  // ===========================================================================
  idempotencyKeys: defineTable({
    agentId: v.id("agents"),
    key: v.string(),
    createdAt: v.number(),
  })
    .index("by_agent_key", ["agentId", "key"])
    .index("by_time", ["createdAt"]),

  // ===========================================================================
  // Aggregate counters — O(1) rolling-window accounting so metering & guards
  // never scan unbounded history (the old .collect() approach was O(n²) within
  // a window). One row per (space, scope, bucket), patched in place:
  //   scope "usage"    bucket "<YYYY-MM>"  → monthly spend accumulator (valueUsd)
  //   scope "a2a:min"  bucket "<epochMin>" → messages sent this minute (rate)
  //   scope "a2a:day"  bucket "<epochDay>" → messages sent today (daily budget)
  //   scope "loop"     bucket "<hash>:<min>" → identical from→to→content repeats
  // Buckets age out naturally (never read once their window passes) and are
  // swept by the "counter sweep" cron.
  // ===========================================================================
  counters: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    scope: v.string(),
    bucket: v.string(),
    count: v.number(),
    valueUsd: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_space_scope_bucket", ["spaceId", "scope", "bucket"])
    .index("by_updated", ["updatedAt"]),

  // ===========================================================================
  // Agent logs — live log streaming from hosted/connected agents (feature 6).
  // Ingested via connector HTTP route → internal mutation; retention sweep
  // deletes by ts. Pagination via by_agent_time / by_space_time.
  // ===========================================================================
  agentLogs: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    level: v.union(
      v.literal("debug"),
      v.literal("info"),
      v.literal("warn"),
      v.literal("error"),
    ),
    message: v.string(),
    // Where the line came from: "stdout" | "stderr" | "harness" | "connector".
    source: v.optional(v.string()),
    // Monotonic sequence within one connector batch (tie-break within same ts).
    seq: v.optional(v.number()),
    meta: v.optional(v.any()),
    ts: v.number(), // producer timestamp (ms epoch)
  })
    .index("by_space_time", ["spaceId", "ts"])
    .index("by_agent_time", ["agentId", "ts"])
    .index("by_agent_level_time", ["agentId", "level", "ts"])
    .index("by_time", ["ts"]),

  // ===========================================================================
  // Agent templates — marketplace (feature 16) + snapshot/clone rows
  // (feature 9). Curated public templates have visibility "public" and no
  // spaceId; snapshots of a live agent are visibility "space" with
  // sourceAgentId set.
  // ===========================================================================
  agentTemplates: defineTable({
    // Null for curated/global templates; set for space-private snapshots.
    companyId: v.optional(v.string()),
    spaceId: v.optional(v.id("spaces")),
    slug: v.string(),
    name: v.string(),
    tagline: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()), // "sales" | "support" | "engineering" | "ops" | ...
    visibility: v.union(v.literal("public"), v.literal("space")),
    featured: v.optional(v.boolean()),
    // Runtime shape:
    harness: v.optional(v.string()), // "hermes" | "openclaw" | "goose" | "generic-cli"
    suggestedModel: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    toolsets: v.optional(v.array(v.string())),
    capabilities: v.optional(v.array(v.string())),
    suggestedConfig: v.optional(v.any()), // env overrides, tool allowlist, etc.
    // Bundled content (portable, inlined so installs clone rather than link):
    skills: v.optional(
      v.array(
        v.object({
          name: v.string(),
          description: v.optional(v.string()),
          content: v.string(),
          tags: v.optional(v.array(v.string())),
        }),
      ),
    ),
    // Optional workflow bundle: same shape as workflows.steps, stored loosely
    // so template authoring isn't coupled to workflow schema evolution.
    workflowBundle: v.optional(v.any()),
    securityProfileName: v.optional(v.string()),
    // Snapshot provenance (feature 9):
    sourceAgentId: v.optional(v.id("agents")),
    author: v.optional(v.string()),
    version: v.optional(v.string()),
    installCount: v.optional(v.number()),
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_slug", ["slug"])
    .index("by_visibility", ["visibility", "featured"])
    .index("by_visibility_category", ["visibility", "category"]),

  // ===========================================================================
  // Security profiles — named container/tool policies attachable to agents
  // (feature 17). Tool allowlist is enforced server-side; egress/fs/secret
  // scopes are passed to /spawn as container policy.
  // ===========================================================================
  securityProfiles: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    // Hostnames/CIDRs the container may reach; empty = deny-all, unset = allow-all.
    egressAllowlist: v.optional(v.array(v.string())),
    fsQuotaMb: v.optional(v.number()),
    // Secret names (secrets.name) this profile's agents may read.
    secretScopes: v.optional(v.array(v.string())),
    // Tool names allowed; unset = no restriction. Enforced by helper in
    // securityProfiles.ts, callable from router/connector paths.
    toolAllowlist: v.optional(v.array(v.string())),
    // Extra opaque policy forwarded verbatim to the fleet worker /spawn.
    containerPolicy: v.optional(v.any()),
    isDefault: v.optional(v.boolean()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_name", ["spaceId", "name"]),

  // ===========================================================================
  // Capability grants — normalized tool layer (feature 12): per-Space mapping
  // of harness-neutral capability tags → concrete Composio/MCP/builtin tools.
  // Consumed by the router (feature 11) and exposed to connectors via a query.
  // ===========================================================================
  capabilityGrants: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    capability: v.string(), // "code-gen" | "browser" | "email" | "crm" | ...
    // Concrete tool identifiers this capability resolves to in this Space.
    toolNames: v.array(v.string()),
    provider: v.optional(v.string()), // "composio" | "mcp" | "builtin"
    // Restrict grant to specific agents; unset = all agents in the Space.
    agentIds: v.optional(v.array(v.id("agents"))),
    enabled: v.boolean(),
    grantedBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_capability", ["spaceId", "capability"]),

  // ===========================================================================
  // Eval benchmarks + runs — cross-harness benchmarking (feature 13). A
  // benchmark is the reusable definition; each run is one agent × benchmark
  // execution with cost + quality persisted for comparison.
  // ===========================================================================
  evalBenchmarks: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
    prompt: v.string(),
    // Grading rubric for the LLM judge / expected output for exact scoring.
    rubric: v.optional(v.string()),
    expectedOutput: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_space", ["spaceId"]),

  evalRuns: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    benchmarkId: v.id("evalBenchmarks"),
    // Groups the N agent-runs launched together for side-by-side comparison.
    batchId: v.optional(v.string()),
    agentId: v.id("agents"),
    harness: v.optional(v.string()),
    model: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    output: v.optional(v.string()),
    qualityScore: v.optional(v.number()), // 0..1
    judge: v.optional(v.string()), // "llm" | "exact" | "human"
    costUsd: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_space_time", ["spaceId", "startedAt"])
    .index("by_benchmark", ["benchmarkId"])
    .index("by_batch", ["batchId"])
    .index("by_agent", ["agentId"]),

  // ===========================================================================
  // Notification prefs — per user × space delivery channels for approvals and
  // other alert categories (feature 19). Webhook secret stored as a reference
  // into the secrets vault, never raw.
  // ===========================================================================
  notificationPrefs: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    userId: v.string(),
    emailEnabled: v.optional(v.boolean()),
    emailAddress: v.optional(v.string()),
    webhookEnabled: v.optional(v.boolean()),
    webhookUrl: v.optional(v.string()),
    // Name of a secrets-vault entry holding the HMAC signing secret.
    webhookSecretRef: v.optional(v.string()),
    // Which categories to deliver: "approval" | "alert" | "run" | ...;
    // unset = approvals only.
    categories: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_user", ["spaceId", "userId"]),

  // ===========================================================================
  // Approval tokens — signed short-lived single-use tokens for one-click
  // approve/deny links (feature 19). Only the SHA-256 hash is stored; the raw
  // token lives solely in the delivered email/webhook. usedAt enforces
  // single-use; expired rows are swept by ts.
  // ===========================================================================
  approvalTokens: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    approvalId: v.id("approvals"),
    tokenHash: v.string(),
    action: v.union(
      v.literal("approve"),
      v.literal("deny"),
      v.literal("either"),
    ),
    // Who the link was issued to (userId or email) — audit trail.
    recipient: v.optional(v.string()),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    usedBy: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_hash", ["tokenHash"])
    .index("by_approval", ["approvalId"])
    .index("by_expires", ["expiresAt"]),

  // ===========================================================================
  // API usage counters — per-key request accounting for the public API
  // (feature 20): rate limiting (minute buckets) + usage reporting (day
  // buckets), O(1) patch-in-place like `counters`.
  //   bucket "min:<epochMin>" | "day:<YYYY-MM-DD>"
  // ===========================================================================
  apiUsage: defineTable({
    companyId: v.string(),
    spaceId: v.id("spaces"),
    apiKeyId: v.id("apiKeys"),
    bucket: v.string(),
    count: v.number(),
    errorCount: v.optional(v.number()),
    // Optional per-route breakdown { "GET /api/v1/agents": n, ... }.
    routes: v.optional(v.record(v.string(), v.number())),
    updatedAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_key_bucket", ["apiKeyId", "bucket"])
    .index("by_updated", ["updatedAt"]),
});
