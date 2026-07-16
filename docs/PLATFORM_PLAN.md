# Hermes Control Plane — Autonomous Company Platform Plan

The goal: a hub where whole **Spaces** (departments) of autonomous agents run an
organization, coordinate over A2A, and produce trackable, auditable work — with
guardrails that make autonomy safe **without** routing everything through a human.

This is the design of record. We execute it **phase by phase**; each phase ships
working, reviewable code on the PR.

## Naming (generally applicable, not hardcoded to "corporate")

| Concept | Term | What it is |
| --- | --- | --- |
| Tenant | **Company** | Billing/identity boundary = Clerk org (or a solo user) |
| Department | **Space** | An autonomous operating unit: owns agents, work, workflows, memory, budgets, integrations |
| Team | **Squad** | A sub-grouping of agents within a Space |
| Worker | **Agent** | A connected Hermes (or external A2A) agent |

Everything below the Company is **isolated per Space**: data, secrets, budgets,
memory, and audit are scoped to a Space and gated by role.

## Roles (RBAC)

Per-Space membership with a strict hierarchy: `viewer < operator < admin < owner`.

- **viewer** — read-only.
- **operator** — create/assign work, run workflows, talk to agents.
- **admin** — manage members, integrations, guard config, kill switch.
- **owner** — everything incl. delete Space / transfer.

Company-level `owner` can administer all Spaces. Authorization is enforced
server-side in every Convex function via `requireRole(scope, min)`.

## Autonomy safety model (not human-in-the-loop)

The platform is built to **run unattended**. Safety comes from **guardrails**,
not approvals:

- **Loop / runaway guards** (per Space, configurable): max agent hops per run,
  max steps per run, max run wall-clock, daily message/A2A budget, repeated-
  message loop detection, max concurrent runs.
- **Kill switch**: per-run cancel and a per-Space `autonomyPaused` master stop
  that halts all dispatch instantly.
- **Budgets**: per-Space spend/usage caps that pause autonomy when exceeded.
- Optional approval gates exist but are **off by default** — used only for
  explicitly designated high-risk actions.

## Architecture

```
  External A2A agents ─┐         ┌─ Hermes agents (connector)
                       ▼         ▼
                  ┌──────────────────────┐
                  │   Convex control plane│  schema · RBAC · guards · scheduler
                  │   - workflow runtime  │  (ctx.scheduler + crons)
                  │   - A2A broker + JSON-RPC/SSE
                  │   - context engine (vector)
                  │   - work history / audit / artifacts
                  └──────────────────────┘
                       ▲                 ▲
              Next.js dashboard     Webhooks / triggers
              (Clerk auth)          (schedules, events, integrations)
```

Convex gives us a genuinely durable runtime: `ctx.scheduler.runAfter/runAt` for
step execution, retries, and timeouts; `crons` for scheduled triggers; HTTP
actions for webhooks and external A2A; vector indexes for the context engine;
file storage for artifacts. The engine is real, not simulated.

## Data model (enterprise schema — all defined up front in `convex/schema.ts`)

Org: `spaces`, `squads`, `spaceMembers`.
Work: `agents`, `threads`, `messages`, `tasks`, `goals`, `projects`.
Coordination: `a2aMessages`, `workflows`, `workflowRuns`, `runSteps`, `triggers`.
Knowledge: `skills`, `memories` (vector).
Record: `workEvents` (immutable audit/history), `artifacts`, `reports`, `usage`.
External: `integrations`.

Every row carries `companyId` + `spaceId`. Reads filter by `spaceId` after a
membership check; company-wide analytics roll up by `companyId`.

## Phases

**Phase 1 — Org backbone & isolation** ✅ *this phase*
Spaces, Squads, members, RBAC roles, per-Space isolation, active-Space context
+ switcher, members/settings UI. Migrate all existing data to be Space-scoped.

**Phase 2 — Autonomy guardrails & durable record** ✅ *this phase*
Guard config + enforcement, kill switch (per-run + per-Space), loop/runaway
detection, immutable `workEvents` audit/history, Work History UI. Wire guards
into A2A routing now; reused by the engine in Phase 3.

**Phase 3 — Workflow runtime, triggers, long-running tasks**
Convex-scheduler execution engine: DAG steps dispatched to agents over A2A,
durable run/step state, retries+backoff, timeouts, resume/cancel; scheduled
(cron) + webhook + event triggers; run timeline UI + kill controls.

**Phase 4 — External A2A interop**
Spec-conformant Agent Cards (`/.well-known/agent-card.json`), JSON-RPC 2.0
`message/send` + `message/stream` (SSE) + `tasks/*`, push-notification config.
Register external agents by card URL; outbound A2A client; guards apply equally.

**Phase 5 — Context engine (shared memory brain)**
`memories` with embeddings + vector retrieval, Space-scoped + company-wide,
ingested from artifacts/threads/integrations; RAG retrieval API; knowledge UI.

**Phase 6 — Work tracking, reports, analytics**
Goals/Projects with rollups; cron-generated daily/weekly digests per Space;
analytics dashboard (throughput, completion, cost, agent/Space breakdowns).

**Phase 7 — Real-world access (integrations)**
Integration framework with OAuth connect, action execution, inbound webhooks
as triggers, encrypted secret storage; first-class Slack/GitHub/email.

**Phase 8 — Ops & scale**
Usage metering + budget enforcement, rate limiting, concurrency control,
SLA/health monitoring + alerts, real-time SSE delivery, audit export.

## Principles

- **Dead simple surface, advanced underneath.** Sensible defaults, one-click
  Space creation, guardrails preconfigured. Power is progressive-disclosure.
- **Enterprise-grade from the schema up.** Isolation, RBAC, and audit are not
  retrofits — they're in the foundation.
- **Autonomy-first.** Humans set direction and guardrails; agents do the work.
