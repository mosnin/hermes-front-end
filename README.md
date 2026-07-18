# Cadre

A consumer + enterprise application to **connect, orchestrate, and control your
agents** — easier than a terminal or a messaging app like Telegram or
Slack.

Deploy your agents wherever you want (AWS, GCP, a VM, your laptop),
connect them here, and give them **threads, tasks, skills, and integrations**.
Watch **everything they do live**, and orchestrate **multiple agents** from one
dashboard.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | **Next.js** (App Router, React, TypeScript) + Tailwind |
| Database | **Convex** — real-time reactivity + **vector search** |
| Auth | **Clerk** — consumer accounts + enterprise orgs/teams |
| Agent bridge | **Python connector** in [`connector/`](./connector/control_plane/) |

```
   Your deployed Hermes agents (AWS / local / anywhere)
            │   connector/control_plane  (HTTPS)
            ▼
   Convex (real-time DB + vector search + HTTP ingestion)
            ▲
            │   reactive queries
   Next.js dashboard  ·  Clerk auth
```

The `connector/` directory is a fork of
[hermes-webui](https://github.com/nesquena/hermes-webui), repurposed as the
agent-side bridge: it registers a deployed agent with the control plane and
streams its activity up to Convex.

## Features

- **Multi-agent registry** — connect many agents, see status/heartbeats, manage each.
- **A2A agent network** — agents talk to each other in real time through a brokered
  Agent2Agent gateway (Agent Card directory + message bus), NAT-friendly since
  agents only connect outbound. Route messages and watch them coordinate live.
- **External A2A interop** — our agents are spec-conformant A2A servers (Agent
  Cards at `/a2a/card/{id}`, JSON-RPC `message/send`/`message/stream`/`tasks/*`),
  and can call any external A2A agent by its card URL — all under the same guards.
- **Live activity** — real-time feed of messages, tool calls, status, and errors.
- **Threads** — conversations/lines of work, created automatically as agents talk.
- **Tasks** — a board to assign, prioritize, and track work per agent.
- **Skills** — reusable instructions/context with **semantic (vector) search**.
- **Context engine (memory brain)** — Space-scoped + company-wide `memories`
  with vector retrieval; agents pull relevant context via `/context/search`
  (RAG), and threads can be saved into memory in one click.
- **Goals, reports & analytics** — Goals/Projects with task rollups, auto daily
  digests + on-demand reports, an analytics dashboard (throughput/completion/
  cost), and artifact/deliverable storage agents can submit to.
- **Integrations (Composio)** — managed OAuth for 250+ tools; agents/workflows
  execute actions through the control plane, and Composio triggers (webhooks)
  start workflows autonomously.
- **Ops & scale** — usage metering + monthly **budget enforcement** (autonomy
  auto-pauses on overspend), rate limiting, agent **health monitoring + alerts**,
  real-time SSE inbox delivery, and audit export.
- **Workflows** — a real autonomous runtime (Convex scheduler): multi-step,
  multi-agent workflows with retries, timeouts, durable run/step state,
  pause/resume/kill, and scheduled/webhook triggers — all under Space guardrails.
- **Spaces, RBAC & guardrails** — Company → Space → Squad with per-Space
  isolation, roles (viewer/operator/admin/owner), a kill switch, loop/runaway
  guards, and an immutable work-history record.

## Quick start

```bash
# 1. Install deps
npm install

# 2. Create a Convex deployment (writes NEXT_PUBLIC_CONVEX_URL to .env.local)
npx convex dev      # leave running; it generates convex/_generated/*

# 3. Configure Clerk + Convex auth
cp .env.example .env.local        # fill in Clerk keys
#    In the Clerk dashboard, create a JWT template named "convex".
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-clerk-domain>
#    (optional) enable vector search:
npx convex env set OPENAI_API_KEY sk-...

# 4. Run the app
npm run dev         # http://localhost:3000
```

Then sign in, open the dashboard, and either click **Load demo data** or
**Connect agent** and run the mock connector:

```bash
export HERMES_CONTROL_PLANE_URL=https://<deployment>.convex.site
export HERMES_CONNECTOR_TOKEN=<token from the UI>
python -m connector.control_plane.mock_agent
```

See [`connector/control_plane/README.md`](./connector/control_plane/README.md)
for wiring a real Hermes agent.

To see **agents talk to each other (A2A)** in real time, register two agents and:

```bash
export HERMES_A2A_TOKEN_A=<token for agent A>
export HERMES_A2A_TOKEN_B=<token for agent B>
python -m connector.control_plane.a2a_demo
```

Then open **Agent network** in the dashboard.

## Deploying to Vercel

The app needs Convex codegen at build time, so the build command runs Convex
first (see `vercel.json`):

```
npx convex deploy --cmd 'npm run build'
```

In the Vercel project, set these env vars (Settings → Environment Variables):

- `CONVEX_DEPLOY_KEY` — from the Convex dashboard (use a **Preview** deploy key
  for PR previews, a Production key for production). This is what lets the build
  generate `convex/_generated` and set `NEXT_PUBLIC_CONVEX_URL` automatically.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` — from Clerk.

Without `CONVEX_DEPLOY_KEY` the build fails on `@/convex/_generated/api` (codegen
never ran) — that's the one required secret.

## Managed hosting (Cadre Cloud)

Beyond "bring your own agent," Spaces can one-click **deploy** hosted agents:
we boot an isolated Cloudflare Container running the Hermes connector per
agent (see [`connector/fleet-worker/`](./connector/fleet-worker/)) and bill
per hosted agent (flat Stripe seat price + hourly agent-hour metering). The
pipeline degrades gracefully when Cloudflare isn't configured — agents are
still created for manual connector wiring. See
[`docs/HOSTED_FLEET.md`](./docs/HOSTED_FLEET.md) for the full launch runbook
(prerequisites, `wrangler deploy` steps, env vars, metering model, incident
playbook).

## Layout

```
app/            Next.js routes (landing, auth, /dashboard/*)
components/     UI primitives + feature components
convex/         schema, queries/mutations/actions, HTTP ingestion, auth config
lib/            small client helpers
connector/      Python agent-side connector (forked hermes-webui)
```

## Tenancy & data model (Convex)

**Company (Clerk org/user) → Space (operating unit) → Squad.** Every domain row
carries `companyId` + `spaceId`; reads scope by `spaceId` after a membership
check, with RBAC (`viewer < operator < admin < owner`) enforced server-side.

Tables: `spaces`, `squads`, `spaceMembers`, `agents`, `threads`, `messages`,
`goals`, `projects`, `tasks`, `a2aMessages`, `workflows`, `workflowRuns`,
`runSteps`, `triggers`, `skills`, `memories`, `workEvents`, `artifacts`,
`reports`, `usage`, `activity`, `integrations`. `messages`, `skills`, and
`memories` carry vector indexes. See [`convex/schema.ts`](./convex/schema.ts).

## Status — built in 8 phases (see [docs/PLATFORM_PLAN.md](./docs/PLATFORM_PLAN.md))

1. **Org backbone** — Spaces/Squads, RBAC, per-Space isolation, Space switcher.
2. **Guardrails & record** — loop/runaway guards, kill switch, immutable work history.
3. **Workflow runtime** — Convex-scheduler engine, triggers (cron/webhook/event), long-running runs.
4. **External A2A** — spec-conformant Agent Cards + JSON-RPC, plus outbound calls.
5. **Context engine** — Space + company memory with vector RAG (`/context/search`).
6. **Work tracking** — Goals/Projects rollups, reports/digests, analytics, artifacts.
7. **Integrations** — Composio managed OAuth, tool execution, triggers.
8. **Ops & scale** — metering + budget auto-pause, rate limiting, health alerts, SSE, audit export.

An autonomy-first platform: humans set direction and guardrails; agents do the
work. Run `npx convex dev` to generate types, then `npm run dev`.
