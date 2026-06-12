# Hermes Control Plane

A consumer + enterprise application to **connect, orchestrate, and control your
Hermes agents** — easier than a terminal or a messaging app like Telegram or
Slack.

Deploy your Hermes agents wherever you want (AWS, GCP, a VM, your laptop),
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
- **Live activity** — real-time feed of messages, tool calls, status, and errors.
- **Threads** — conversations/lines of work, created automatically as agents talk.
- **Tasks** — a board to assign, prioritize, and track work per agent.
- **Skills** — reusable instructions/context with **semantic (vector) search**.
- **Integrations** — Slack, GitHub, Gmail, Linear, Notion, Calendar (scaffolded).
- **Orchestration** — compose multi-step, multi-agent workflows.

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

## Layout

```
app/            Next.js routes (landing, auth, /dashboard/*)
components/     UI primitives + feature components
convex/         schema, queries/mutations/actions, HTTP ingestion, auth config
lib/            small client helpers
connector/      Python agent-side connector (forked hermes-webui)
```

## Data model (Convex)

`agents`, `threads`, `messages`, `tasks`, `skills`, `integrations`, `activity`,
`orchestrations` — all scoped by `ownerId` (Clerk org for teams, user for
consumers). `skills` and `messages` carry vector indexes for semantic search.
See [`convex/schema.ts`](./convex/schema.ts).

## Status

This is the foundation PR. Wired and working: schema, Clerk↔Convex auth,
multi-agent registry + one-time token flow, connector ingestion API, live
activity, threads, tasks, skills (with vector search), integrations,
orchestration scaffold, and a mock connector. Real agent ↔ connector wiring and
deeper orchestration execution are the next steps.
