# Product Roadmap — next levels

Built on the 8-phase platform foundation (see PLATFORM_PLAN.md). These phases
take it from a working scaffold to a premium, sellable product. We ship
phase by phase; each lands working, reviewable code on the PR.

| Phase | Theme | Headline items |
| --- | --- | --- |
| **R1** | UX foundation | Command palette (⌘K), global search, toast system, modal confirm/prompt (kill `window.prompt`), grouped sidebar, light/dark theme |
| **R2** | Streaming chat | Token streaming, markdown + code highlighting, expandable tool-call cards, composer (stop/regenerate, attachments, @mentions, slash cmds), thread mgmt UI |
| **R3** | Real agent bridge | Wire a real Hermes agent → connector → control plane; agent onboarding flow + live "connected ✓"; agent config (model/toolset) from UI |
| **R4** | Visual workflows | DAG builder, control-flow nodes (branch/loop/parallel/wait/approval), per-step I/O + variables, run trace waterfall, retry-from-step, templates, fix manual-run-simulates |
| **R5** | Mission control | Live multi-agent topology graph, agent personas, supervisor/Squad delegation, shared blackboard |
| **R6** | Collaboration | In-app notifications center + email/Slack/push digests, comments/@mentions on tasks/threads/runs, presence, shareable links |
| **R7** | Integrations depth | Composio marketplace browser, in-app auth-config + trigger catalog, action test console, Slack/Telegram control bridge, control-plane-as-MCP |
| **R8** | Knowledge | Document ingestion (PDF/URL → chunk → embed), memory browser + provenance, citations in chat, knowledge graph |
| **R9** | Tasks depth | Drag-and-drop kanban, calendar/timeline, subtasks/dependencies/recurring, task→workflow, auto-assign by capability |
| **R10** | Governance | Approval-policy UI, audit log browser, secrets vault, custom roles/permissions, SSO/SCIM surfacing |
| **R11** | Platform | Stripe billing (seats + usage), plan limits, public API + keys + SDK + CLI, outbound webhooks |
| **R12** | Reliability | Paginate cron scans, harden SSE, tests + root CI, multi-region |

Principle: **autonomy-first, premium-feel.** Humans set direction; agents do the
work; the UI makes a fleet of agents feel effortless to command.
